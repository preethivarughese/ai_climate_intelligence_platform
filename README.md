# AI Climate Intelligence Platform (India)

FastAPI backend + React/Vite frontend aggregating ground telemetry (CPCB/WAQI), meteorology
(Open-Meteo), Sentinel-5P tropospheric NO2, NASA FIRMS active fires, citizen photos (Gemini
vision) and citizen low-cost sensor readings into hyper-local hotspot detection, PM2.5
forecasting, federated model sharing across state nodes, and real authority alert dispatch.

## Quick start

```bash
# backend
cd backend
pip install -r requirements.txt
printf 'GEMINI_API_KEY=\nWAQI_API_TOKEN=\n' > .env   # then fill in the keys below
uvicorn app.main:app --reload      # http://localhost:8000 (docs at /docs)

# frontend
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

In development the Vite dev server proxies `/api` to `http://localhost:8000`
(see `frontend/vite.config.ts`), so no frontend configuration is required.

## Environment variables

### Backend (`backend/.env`, read by `backend/app/core/config.py`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes, for photo analysis | Google Gemini key used by `POST /api/images/analyze` and the authority recommendations. Without it the upload endpoint returns `analysis_status: "MISSING_API_KEY"` and logs an error (the key itself is never returned). Create one at https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | no | Vision/text model, defaults to `gemini-flash-latest`. |
| `WAQI_API_TOKEN` | recommended | World Air Quality Index token for live CPCB station feeds. Request one at https://aqicn.org/data-platform/token/ . Without it station data falls back to Open-Meteo values. |
| `SENTINEL_HUB_CLIENT_ID` / `SENTINEL_HUB_CLIENT_SECRET` | optional | OAuth client credentials for the Sentinel Hub Statistical API, used for direct Sentinel-5P TROPOMI NO2 retrievals. Create them under "User settings → OAuth clients" at https://apps.sentinel-hub.com/dashboard/ . Without them the platform falls back to a CAMS surface-NO2-derived column estimate (flagged in the response). |
| `SENTINEL_HUB_BASE_URL` | no | Defaults to `https://services.sentinel-hub.com`. |
| `NASA_FIRMS_MAP_KEY` | optional | NASA FIRMS map key for VIIRS active-fire detections near a city (stubble/biomass burning evidence). Free key at https://firms.modaps.eosdis.nasa.gov/api/map_key/ . Without it the fire panel reports `Not configured` instead of inventing detections. |
| `DATA_DB_PATH` | no | SQLite file for citizen readings, image verdicts, alerts, authority decisions and federated rounds. Defaults to `data/platform.db` in the repo root. |
| `ADMIN_ACCESS_TOKEN` | yes, for authority actions | Shared operator token. Required as `Authorization: Bearer <token>` on `/api/authority/session`, `/dispatch` and `POST /feedback`. When unset those endpoints return 503 and the console cannot sign in. |
| `ALERT_WEBHOOK_URL` | optional | HTTPS endpoint (Slack/Teams/ops bus) that receives the alert JSON `{text, event, recommendation}`. |
| `ALERT_EMAIL_TO` / `ALERT_EMAIL_FROM` | optional | Comma-separated recipients and sender for email alerts. |
| `ALERT_SMTP_HOST` / `ALERT_SMTP_PORT` / `ALERT_SMTP_USER` / `ALERT_SMTP_PASSWORD` | optional | SMTP relay (STARTTLS, login only when user/password are set). Port defaults to 587. |
| `ALERT_MIN_CONFIDENCE` | no | Fused-confidence floor for auto-dispatch, default `0.55`. |
| `ALERT_MIN_PM25` | no | PM2.5 floor (µg/m³) for auto-dispatch, default `90`. |
| `ALERT_COOLDOWN_MINUTES` | no | Per-region suppression window, default `30`. |
| `CORS_ALLOW_ORIGINS` | recommended in production | Comma-separated allowed origins, default `*`. Credentials are only allowed when it is not `*`. |

Never commit `.env`; it is git-ignored, as is the generated `data/` SQLite file.

### Frontend (`frontend/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_BASE` | only when deployed | Absolute backend origin, e.g. `https://api.example.org`. Empty/unset in local dev so the Vite proxy handles `/api`. All frontend requests go through `apiUrl()` in `frontend/src/api.ts`. |

## Satellite NO2

`backend/app/services/satellite_no2.py` returns the latest tropospheric NO2 column for a
coordinate plus a z-score against the trailing 30-day baseline:

1. **Sentinel-5P TROPOMI** via the Sentinel Hub Statistical API (daily means, `mol/m²`
   converted to `molec/cm²`) when Sentinel Hub credentials are configured.
2. **CAMS surface NO2** via Open-Meteo, converted to an approximate column with a 300 m
   effective mixing height, when the satellite source is unavailable. Responses carry
   `is_direct_satellite_retrieval: false` and a `status_detail` explaining the fallback.

Results are cached in-process for 30 minutes per coordinate.

`GET /api/fusion?city=Delhi%20NCR&lat=28.6139&lon=77.2090` feeds those values into
`fuse_environmental_signals` and returns `{ "event": FusedHotspotEvent, "satellite_no2": {...} }`.
The Evidence Fusion tab renders the live column value and its sigma deviation.

## Citizen sensor intake

```bash
curl -X POST localhost:8000/api/citizen/sensor -H 'Content-Type: application/json' \
  -d '{"device_id":"sds011-01","lat":28.61,"lon":77.21,"pm25":180.5,"pm10":240}'
```

Readings are validated (PM2.5 0–2000 µg/m³, coordinates in range; violations return 422),
persisted in SQLite, scored against the CPCB NAQI breakpoints and compared with the nearest
official telemetry. `GET /api/citizen/sensor?lat=&lon=&radius_km=&hours=` returns the recent
readings for an area; they are also fed into the fusion engine and the local training round.

## Forecasting

`GET /api/forecast?city=&lat=&lon=&hours=12` and every city payload use the RandomForest
forecaster in `backend/app/services/ml_engine.py`, trained on CAMS/ERA5 hourly observations
for five cities over 30 days (lagged PM2.5, rolling mean, hour of day, temperature, humidity,
wind). `GET /api/model/status` exposes provenance — `training_data_source`, `training_samples`,
`holdout_mae_ugm3`, `is_observation_trained` — so a synthetic-fallback model is never passed
off as an observation-trained one. Retraining happens at most hourly.

## Federated model sharing

Three state nodes (Delhi NCR, Karnataka, Punjab agro-corridor) each train a local Ridge model
on their own observations plus local citizen readings. `POST /api/federated/sync` runs a
sample-weighted FedAvg round over the node coefficients — **only coefficients, intercept,
sample count and local MAE leave a node; raw observations never do.** Offline nodes are
excluded rather than contributing placeholders. `GET /api/federated/status` returns the
current global model and node table, `GET /api/federated/rounds` the persisted round history.

## Authority alerting

`POST /api/authority/dispatch` (admin token) re-fuses the region, generates the multilingual
recommendation and actually delivers it over the configured channels. Dispatch outcomes are
explicit and persisted to `alerts`: `SENT`, `PARTIAL`, `FAILED`, `NOT_TRIGGERED` (below the
confidence/PM2.5 thresholds), `SUPPRESSED_COOLDOWN`, or `NO_CHANNEL_CONFIGURED` when no
webhook/SMTP settings exist. `GET /api/authority/alerts` returns the log and
`POST /api/authority/feedback` persists operator decisions for replay into training.

## Tests

```bash
cd backend && pytest              # add -m "not network" to skip live CAMS/ERA5 calls
cd frontend && npx tsc --noEmit && npm run build
```

## Deployment notes

- Backend: `uvicorn app.main:app --host 0.0.0.0 --port $PORT` from `backend/`, with the
  environment variables above set in the platform's secret store. Set `CORS_ALLOW_ORIGINS`
  to the frontend origin in production, and point `DATA_DB_PATH` at persistent storage —
  the SQLite file holds citizen readings, alerts and federated rounds.
- Frontend: `npm run build` in `frontend/` (output in `frontend/dist/`) with
  `VITE_API_BASE` set at build time to the deployed backend origin, since Vite inlines
  `import.meta.env` values at build time. Serve `dist/` from any static host.
- Outbound network access is required for api.waqi.info, open-meteo.com,
  air-quality-api.open-meteo.com, archive-api.open-meteo.com, firms.modaps.eosdis.nasa.gov,
  services.sentinel-hub.com and generativelanguage.googleapis.com.
