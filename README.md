# AI Climate Intelligence Platform (India)

FastAPI backend + React/Vite frontend aggregating ground telemetry (CPCB/WAQI), meteorology
(Open-Meteo), Sentinel-5P tropospheric NO2, NASA FIRMS active fires, citizen photos (Gemini
vision) and citizen low-cost sensor readings into hyper-local hotspot detection, PM2.5
forecasting, federated model sharing across state nodes, and real authority alert dispatch.

## 🚀 Quick Start

### Prerequisites
- Python 3.9+, pip
- Node.js 16+, npm
- Google Cloud credentials (for Gemini API, Maps)
- Firebase project (for authentication & Firestore)

### Backend Setup

```bash
# Install dependencies
cd backend
pip install -r requirements.txt

# Create .env file with API keys
cat > .env << EOF
GEMINI_API_KEY=your_gemini_key
WAQI_API_TOKEN=your_waqi_token
VITE_WAQI_API_TOKEN=your_waqi_token
ADMIN_ACCESS_TOKEN=your_secure_token
EOF

# Run development server
uvicorn app.main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

### Frontend Setup

```bash
# Install dependencies
cd frontend
npm install

# Create .env file
cat > .env << EOF
VITE_FIREBASE_API_KEY=your_firebase_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_GOOGLE_MAPS_API_KEY=your_maps_key
VITE_WAQI_API_TOKEN=your_waqi_token
EOF

# Start dev server
npm run dev
# Open: http://localhost:5173
```

## Architecture

### Tech Stack

**Backend**
- **Framework**: FastAPI (Python)
- **Database**: SQLite (local), Firestore (production)
- **APIs**: WAQI, OpenMeteo, Sentinel Hub, NASA FIRMS, Gemini Vision
- **ML**: scikit-learn for PM2.5 forecasting

**Frontend**
- **Framework**: React 18 + TypeScript
- **UI**: Tailwind CSS + Lucide icons
- **Maps**: React-Leaflet + Google Maps API
- **Auth**: Firebase Authentication
- **Voice**: Web Speech API (native browser)
- **i18n**: English, हिंदी (Hindi), ಕನ್ನಡ (Kannada)

### Core Features

#### 1. **Multi-Source Evidence Fusion** 🔗
- Ground telemetry (CPCB CAAQMS stations)
- Citizen photo analysis (Gemini Vision)
- Low-cost sensor readings
- Satellite NO₂ (Sentinel-5P)
- Active fire detections (NASA FIRMS)
- Meteorological anomalies (Open-Meteo)

**Endpoints**:
- `GET /api/regions` - Live data for major cities
- `POST /api/images/analyze` - Gemini photo analysis
- `GET /api/fusion` - Fused hotspot detection
- `GET /api/corridors` - Economic corridor intelligence

#### 2. **Citizen Evidence Collection** 📱
- Voice input (English, Hindi, Kannada)
- Image uploads with Gemini analysis
- Pollution report creation in Firestore
- Real-time location tagging
- Multilingual UI

**Components**:
- `CitizenReportForm` - Report pollution events
- `VoiceAndLanguage` - Voice-to-text, text-to-speech
- `AQIMap` - Interactive Google Maps visualization

#### 3. **Real-Time Alerts & Dispatch** 🚨
- Live API refresh for regional and corridor telemetry
- Authority command center
- Multi-channel notification (Slack, email, webhook)
- Federated alert sharing

**Endpoints**:
- `GET /api/authority/session` - Admin authentication
- `POST /api/authority/dispatch` - Send alerts
- `GET /api/authority/alerts` - Alert history

#### 4. **ML-Powered Forecasting** 📊
- 12-hour PM2.5 trajectory prediction
- Trained on 5+ years of CAMS/ERA5 history
- Incorporates temperature, humidity, wind patterns
- Adaptive baseline calculation

**Endpoints**:
- `GET /api/forecast` - PM2.5 prediction
- `GET /api/model/status` - Model metadata

#### 5. **Federated Learning** 🔐
- State nodes train locally without exporting raw data
- FedAvg weight synchronization
- Privacy-preserving model averaging

**Endpoints**:
- `POST /api/federated/sync` - Trigger FedAvg round
- `GET /api/federated/status` - Round status

## Authentication & Authorization

### Firebase Setup (Required for Production)

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for comprehensive instructions.

**Roles**:
- **Citizen**: Report pollution, view maps, access alerts
- **Authority**: Dispatch interventions, manage alerts, provide feedback
- **Analyst**: Train federated models, analyze trends

### Firestore Collections

- `users` - User profiles with roles
- `pollution_reports` - Citizen reports (images, descriptions, location)
- `alerts` - System-generated alerts
- `models` - Federated model metadata

## API Reference

### Public Endpoints

```bash
# Get all major cities
curl http://localhost:8000/api/regions

# Search a city
curl "http://localhost:8000/api/search-city?query=Mumbai"

# Get economic corridor intelligence
curl http://localhost:8000/api/corridors

# Get fused hotspot for a region
curl "http://localhost:8000/api/fusion?city=Delhi&lat=28.6139&lon=77.209"

# Get PM2.5 forecast
curl "http://localhost:8000/api/forecast?city=Delhi&hours=12"
```

### Image Analysis

```bash
# Upload and analyze
curl -X POST http://localhost:8000/api/images/analyze \
  -F "file=@pollution.jpg" \
  -F "lat=28.6139" \
  -F "lon=77.209"

# Use preset scenario
curl http://localhost:8000/api/images/analyze \
  -F "preset_scenario=biomass_burning"
```

### Citizen Sensor Readings

```bash
# Submit sensor reading
curl -X POST http://localhost:8000/api/citizen/sensor \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sensor_001",
    "lat": 28.6139,
    "lon": 77.209,
    "pm25": 145.5,
    "pm10": 220.0
  }'

# List readings near a location
curl "http://localhost:8000/api/citizen/sensor?lat=28.6139&lon=77.209&radius_km=25"
```

## Environment Variables

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

## 🚀 Deployment

For comprehensive deployment instructions, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

### Live demo

- **Frontend:** https://ai-climate-intelligence-app.web.app/
- **Backend (Render):** https://ai-climate-intelligence-platform.onrender.com


### Quick Deploy to Google Cloud

**Backend (Cloud Run)**:
```bash
cd backend
gcloud builds submit --tag gcr.io/$PROJECT_ID/climate-api:latest
gcloud run deploy climate-api \
  --image gcr.io/$PROJECT_ID/climate-api:latest \
  --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY,WAQI_API_TOKEN=$WAQI_API_TOKEN"
```

**Frontend (Firebase Hosting)**:
```bash
cd frontend
npm run build
firebase deploy --only hosting
```

### Production Checklist

- ✅ Firebase project created with Authentication & Firestore
- ✅ API keys secured in Cloud Run environment variables
- ✅ CORS configured for frontend origin
- ✅ Firestore security rules enforced
- ✅ Cloud Run auto-scaling configured
- ✅ Monitoring and logging enabled
- ✅ Custom domain setup (optional)

## 🎯 Features Implemented

- ✅ **Firebase Authentication** with role-based access (Citizen/Authority/Analyst)
- ✅ **Multi-language Support** (English, हिंदी, ಕನ್ನಡ)
- ✅ **Voice Input** (Web Speech API) for citizen reports
- ✅ **Text-to-Speech** for accessibility
- ✅ **Google Maps Integration** with real-time pollution markers
- ✅ **WAQI API Integration** for live AQI data across India
- ✅ **Citizen Report Form** with image upload & voice descriptions
- ✅ **Gemini Vision API** for pollution image analysis
- ✅ **Firestore Database** for user profiles and pollution reports
- ✅ **Real-time Alerts** via multiple channels
- ✅ **PM2.5 Forecasting** using ML models
- ✅ **Federated Learning** for privacy-preserving model training
- ✅ **Economic Corridor Intelligence** for freight/industrial monitoring
- ✅ **Authority Command Center** for rapid response coordination

## 📊 Key Metrics

- **Coverage**: 6 major Indian cities + 3 economic corridors
- **Latency**: <2s for region queries, <5s for image analysis
- **Languages**: 3 (English, Hindi, Kannada)
- **Data Sources**: 6+ (CPCB, citizen photos, satellites, weather, fires, sensors)
- **Scalability**: Auto-scaling on Cloud Run, Firestore for unlimited users

## 📝 Project Structure

```
ai_climate_intelligence_platform/
├── backend/
│   ├── app/
│   │   ├── api/endpoints.py        # FastAPI routes
│   │   ├── core/config.py          # Configuration
│   │   ├── models/schemas.py       # Pydantic schemas
│   │   ├── services/
│   │   │   ├── evidence_fusion.py  # Multi-source fusion
│   │   │   ├── gemini_analyzer.py  # Image analysis
│   │   │   ├── ml_engine.py        # PM2.5 forecasting
│   │   │   ├── federated_service.py # Federated learning
│   │   │   └── ...
│   │   └── main.py                 # FastAPI app
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthModal.tsx       # Login/signup
│   │   │   ├── AQIMap.tsx          # Google Maps integration
│   │   │   ├── VoiceAndLanguage.tsx # Voice input
│   │   │   ├── CitizenReportForm.tsx # Report submission
│   │   │   └── ...
│   │   ├── contexts/AuthContext.tsx # Firebase auth
│   │   ├── services/firebase.ts     # Firebase config
│   │   ├── i18n/translations.ts     # Multilingual strings
│   │   └── App.tsx                  # Main component
│   └── package.json
├── FIREBASE_SETUP.md               # Firebase configuration guide
├── DEPLOYMENT_GUIDE.md             # Cloud deployment guide
└── README.md
```

## 🔒 Security & Privacy

- **Federated Learning**: Models trained locally, only weights shared
- **Firestore Security Rules**: Row-level access control
- **API Authentication**: Bearer token for admin endpoints
- **HTTPS Only**: All API calls encrypted
- **Data Minimization**: No raw sensor data stored long-term
- **.env Protection**: Credentials never committed to git

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Submit a pull request

## 📜 License

This project is licensed under the MIT License - see LICENSE file for details.

## 👨‍💻 Authors

- **Climate Intelligence Team** - Full-stack development
- Powered by Google AI (Gemini, Maps, Cloud Run)

## 🙏 Acknowledgments

- **CPCB**: Real-time AQI data (CAAQMS network)
- **WAQI**: World Air Quality Index API
- **Open-Meteo**: Free meteorology & reanalysis data
- **Sentinel Hub**: Sentinel-5P satellite imagery
- **NASA**: Active fire detection (FIRMS)
- **Google**: Gemini Vision API, Cloud Platform, Maps

## 📞 Support

- **Issues**: Open GitHub issues for bugs/feature requests
- **Discussions**: GitHub Discussions for questions
- **Documentation**: See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) and [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

---

**Built for India's climate action — by citizens, for citizens, with federated intelligence.**
