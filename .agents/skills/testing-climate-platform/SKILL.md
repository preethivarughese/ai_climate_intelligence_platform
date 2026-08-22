---
name: testing-climate-platform
description: How to run and runtime-test the AI Climate Intelligence Platform (FastAPI backend + Vite/React frontend) locally, including admin-token auth, alert webhook delivery, citizen sensor intake, federated sync and telemetry panels.
---

# Runtime-testing the AI Climate Intelligence Platform

## Bring the stack up

```bash
# backend (venv may be named .venv or venv — check both)
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
ADMIN_ACCESS_TOKEN=test-token \
DATA_DB_PATH=/tmp/ui_test.db \
ALERT_WEBHOOK_URL=http://127.0.0.1:9911/hook \
  .venv/bin/uvicorn app.main:app --port 8000

# frontend
cd frontend && npm install && npm run dev     # :5173, proxies /api to :8000
```

Gotchas:
- Vite silently falls back to **:5174** if an old dev server still holds :5173. Kill stale
  `vite`/`node` processes (`pgrep -af vite`) before starting, or you may test stale code.
- `backend/.env` may not exist; secrets can come from the session environment instead. Confirm
  `GEMINI_API_KEY`/`WAQI_API_TOKEN` are inherited by uvicorn before blaming the app.
- Use a throwaway `DATA_DB_PATH` (e.g. `/tmp/ui_test.db`) so persistence assertions start clean.
  Tables: `citizen_sensor_readings`, `citizen_image_reports`, `authority_feedback`, `alerts`,
  `federated_rounds`. `sqlite3` CLI is not installed — query with `python3 -c "import sqlite3..."`.

## Proving real alert delivery

Run a tiny receiver before the backend so the webhook channel is configured:

```python
# /tmp/hook_server.py — logs every POST body to /tmp/hook_received.log, replies 200
```
Then in the UI: Officer Login → Authority Command → "Dispatch intervention notice".
Expect `SENT` + `webhook: SENT — HTTP 200` in the UI and a full notice body in the log
(`{"text": ..., "alert": {...}}`). Alerts also land in the `alerts` table with `delivery_status`.

## Auth

Login modal takes the raw `ADMIN_ACCESS_TOKEN` (no username). Wrong token surfaces
"Invalid or missing admin access token." Successful login reveals the "Authority Command (Admin)"
tab and issues `Authorization: Bearer <token>` for dispatch/feedback.

## Gemini quota

Uploads and the Authority tab's recommendation line both call Gemini; the Authority tab fires one
call automatically on login. Gemini frequently returns 503 "high demand" — the app surfaces this as
`analysis_status: UPSTREAM_ERROR`, which is correct behaviour, not a bug. Budget uploads carefully
when a quota constraint is given, and prefer the Gemini-free features (sensor intake, auth,
dispatch, feedback, federated sync, telemetry modal).

## Where things live in the UI

- Citizen Evidence Fusion tab: photo dropzone, low-cost sensor form, live NO2 tile.
  Note the panel does **not** render `event.evidence_breakdown` — verify fusion evidence rows via
  `GET /api/fusion?city=&lat=&lon=&state=` rather than expecting them on screen.
- Telemetry modal (National Grid → "View Telemetry"): FIRMS active-fire panel (says
  "Not configured" without `NASA_FIRMS_MAP_KEY`) and the forecast provenance badge.
- Federated State Network tab: node cards + "Trigger FedAvg Weight Sync"; a round increments
  `round_number` and rewrites `federated_rounds`.

## Devin Secrets Needed

- `GEMINI_API_KEY` (vision + recommendation text)
- `WAQI_API_TOKEN` (live AQI)
- Optional: `SENTINEL_HUB_CLIENT_ID` / `SENTINEL_HUB_CLIENT_SECRET` (real Sentinel-5P instead of the
  CAMS/Open-Meteo fallback), `NASA_FIRMS_MAP_KEY` (real active-fire detections)
