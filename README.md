# AI Climate Intelligence Platform (India)

FastAPI backend + React/Vite frontend aggregating ground telemetry (CPCB/WAQI), meteorology
(Open-Meteo), Sentinel-5P tropospheric NO2 and Gemini vision analysis of citizen photos.

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
| `GEMINI_MODEL` | no | Vision/text model, defaults to `gemini-2.5-flash`. |
| `WAQI_API_TOKEN` | recommended | World Air Quality Index token for live CPCB station feeds. Request one at https://aqicn.org/data-platform/token/ . Without it station data falls back to Open-Meteo values. |
| `SENTINEL_HUB_CLIENT_ID` / `SENTINEL_HUB_CLIENT_SECRET` | optional | OAuth client credentials for the Sentinel Hub Statistical API, used for direct Sentinel-5P TROPOMI NO2 retrievals. Create them under "User settings → OAuth clients" at https://apps.sentinel-hub.com/dashboard/ . Without them the platform falls back to a CAMS surface-NO2-derived column estimate (flagged in the response). |
| `SENTINEL_HUB_BASE_URL` | no | Defaults to `https://services.sentinel-hub.com`. |

Never commit `.env`; it is git-ignored.

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

## Deployment notes

- Backend: `uvicorn app.main:app --host 0.0.0.0 --port $PORT` from `backend/`, with the
  environment variables above set in the platform's secret store. CORS is currently open
  (`allow_origins=["*"]`) — restrict it in `backend/app/main.py` for production.
- Frontend: `npm run build` in `frontend/` (output in `frontend/dist/`) with
  `VITE_API_BASE` set at build time to the deployed backend origin, since Vite inlines
  `import.meta.env` values at build time. Serve `dist/` from any static host.
- Outbound network access is required for api.waqi.info, open-meteo.com,
  earthquake.usgs.gov, services.sentinel-hub.com and generativelanguage.googleapis.com.
