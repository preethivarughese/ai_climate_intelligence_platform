# AI Climate Intelligence Platform - Deployment Guide

## Overview
This document covers deploying the AI Climate Intelligence Platform to Google Cloud Platform (GCP), consisting of:
- **Backend**: FastAPI application on Cloud Run
- **Frontend**: React/TypeScript application on Firebase Hosting
- **Database**: Firestore for user data and reports
- **Authentication**: Firebase Authentication

## Prerequisites
1. Google Cloud Project with billing enabled
2. GCP CLI installed (`gcloud` command)
3. Node.js 16+ and npm
4. Python 3.9+ and pip
5. Docker installed (for Cloud Run deployment)
6. Firebase CLI installed (`npm install -g firebase-tools`)

## Part 1: Backend Deployment (Cloud Run)

### Step 1: Setup Google Cloud Project

```bash
# Set project ID
export PROJECT_ID="your-project-id"
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

### Step 2: Create Dockerfile for Backend

The backend needs a Dockerfile. Create `backend/Dockerfile`:

```dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY backend/app ./app

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Step 3: Build and Push to Cloud Run

```bash
cd backend

# Build the container image
gcloud builds submit --tag gcr.io/$PROJECT_ID/climate-api:latest

# Deploy to Cloud Run
gcloud run deploy climate-api \
  --image gcr.io/$PROJECT_ID/climate-api:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY,WAQI_API_TOKEN=$WAQI_API_TOKEN"

# Get the service URL
gcloud run services describe climate-api --region us-central1 --format='value(status.url)'
```

### Step 4: Configure Environment Variables

Set the following in Cloud Run:

```bash
gcloud run services update climate-api \
  --region us-central1 \
  --set-env-vars \
    GEMINI_API_KEY=your_key,\
    WAQI_API_TOKEN=your_token,\
    ADMIN_ACCESS_TOKEN=your_secure_token
```

## Part 2: Frontend Deployment (Firebase Hosting)

### Step 1: Initialize Firebase Project

```bash
cd frontend

# Login to Firebase
firebase login

# Initialize Firebase in the project
firebase init hosting
# Choose your Firebase project when prompted
```

### Step 2: Update Configuration

Update `frontend/.env.production`:

```
VITE_API_URL=https://climate-api-xxx.run.app  # Your Cloud Run URL
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key
VITE_WAQI_API_TOKEN=your_waqi_token
```

### Step 3: Build and Deploy Frontend

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

## Part 3: Configure CORS for Backend

In `backend/app/main.py`, update CORS configuration:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-firebase-project.firebaseapp.com",
        "http://localhost:5173"  # for local development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Part 4: Firestore Setup for Production

### Create Production Indexes

1. Go to Firebase Console → Firestore Database
2. Create indexes for queries:
   - Collection: `pollution_reports`, Fields: `userId` (Ascending), `timestamp` (Descending)
   - Collection: `pollution_reports`, Fields: `severity` (Ascending), `timestamp` (Descending)

### Security Rules

Replace Firestore rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own profile
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }

    // Anyone can read pollution reports, authenticated users can create
    match /pollution_reports/{document=**} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.userId;
    }

    // Authorities manage alerts
    match /alerts/{document=**} {
      allow read: if true;
      allow write: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'authority';
    }

    // Analysts can access models
    match /models/{document=**} {
      allow read: if true;
      allow write: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'analyst';
    }
  }
}
```

## Part 5: Monitoring and Logging

### Enable Cloud Logging

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=climate-api" \
  --limit 50 \
  --format json
```

### Setup Alerts

```bash
# Alert on high error rates
gcloud alpha monitoring policies create \
  --notification-channels=your-channel-id \
  --display-name="Climate API Errors" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05
```

## Part 6: Domain Setup (Optional)

### Add Custom Domain

1. Go to Firebase Console → Hosting
2. Click "Add custom domain"
3. Follow DNS setup instructions
4. SSL certificate is automatically provisioned

## Environment Variables Summary

### Backend (Cloud Run)

| Variable | Example | Purpose |
|----------|---------|---------|
| `GEMINI_API_KEY` | `AIza...` | Gemini API key |
| `WAQI_API_TOKEN` | `faa2d...` | WAQI API token |
| `ADMIN_ACCESS_TOKEN` | `secure-token-123` | Admin authentication |

### Frontend (.env.production)

| Variable | Example | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `https://climate-api-xxx.run.app` | Backend API endpoint |
| `VITE_FIREBASE_*` | Various | Firebase configuration |
| `VITE_GOOGLE_MAPS_API_KEY` | `AIza...` | Google Maps API |

## Troubleshooting

### Cloud Run Deployment Issues

```bash
# Check logs
gcloud run logs read climate-api --region us-central1

# Verify environment variables
gcloud run services describe climate-api --region us-central1

# Test endpoint
curl https://climate-api-xxx.run.app/api/regions
```

### Firebase Deployment Issues

```bash
# Check Firebase hosting logs
firebase hosting:channel:list

# Test local build
npm run preview

# Deploy with verbose output
firebase deploy --debug
```

### CORS Errors

```bash
# Add origin to allowed list
gcloud run services update climate-api \
  --update-env-vars "ALLOWED_ORIGINS=https://your-domain.firebaseapp.com"
```

## Performance Optimization

### Frontend

```bash
# Analyze bundle size
npm run build -- --analyze

# Enable service workers for offline support
# Already configured in vite.config.ts with workbox
```

### Backend

```python
# Enable caching in main.py
from fastapi_cache2 import FastAPICache2
from fastapi_cache2.backends.redis import RedisBackend

# Configure Redis for caching
@app.get("/api/regions", tags=["Data"])
@cached(namespace="regions", expire=3600)  # Cache for 1 hour
async def get_all_regions():
    pass
```

## Scaling Considerations

1. **Cloud Run Auto-scaling**: Default is 100 concurrent requests
   ```bash
   gcloud run services update climate-api --concurrency 100
   ```

2. **Firestore**: Use collection group queries for large datasets
   ```python
   async def search_all_reports(query_term):
       return await db.collection_group('reports').where('title', '==', query_term).get()
   ```

3. **CDN**: Firebase Hosting uses Google's global CDN (already configured)

## Cost Optimization

- Use Cloud Run's always-free tier (2M requests/month)
- Keep Firestore on Spark plan if development-only
- Set reasonable rates for quotas
- Use regional Cloud Build (cheaper than multi-region)

## Next Steps

1. **CI/CD Pipeline**: Setup GitHub Actions for automatic deployments
2. **Monitoring**: Configure alerts for errors and performance
3. **Analytics**: Enable Google Analytics on Firebase Hosting
4. **Security**: Enable reCAPTCHA for sensitive endpoints
5. **Backup**: Enable Firestore backups

## Support

For issues or questions:
- Check Cloud Run and Firebase documentation
- Review application logs: `firebase hosting:channel:list`
- Test locally before deploying: `npm run dev`
