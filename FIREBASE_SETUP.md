# Firebase Setup Guide

## Prerequisites
1. Google Cloud Project with Billing enabled
2. Firebase Project (create at [firebase.google.com](https://firebase.google.com))
3. Node.js 16+

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use an existing one
3. Enable these services:
   - **Authentication** (Email/Password)
   - **Firestore Database** (Choose production mode)
   - **Storage** (for citizen-uploaded images)

## Step 2: Get Firebase Config

1. In Firebase Console, go to Project Settings
2. Copy your Web App config:
   ```
   apiKey
   authDomain
   projectId
   storageBucket
   messagingSenderId
   appId
   ```

3. Add to your `.env` file:
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

## Step 3: Setup Firestore Database

1. In Firebase Console, go to Firestore Database
2. Create a new database in production mode
3. Create these collections:
   - `users` - Store user profiles
   - `pollution_reports` - Citizen pollution reports
   - `alerts` - System alerts for authorities
   - `models` - Federated model metadata

### Firestore Security Rules

Replace the default security rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own document
    match /users/{uid} {
      allow read: if request.auth.uid == uid;
      allow write: if request.auth.uid == uid;
    }

    // Anyone can read pollution reports
    match /pollution_reports/{document=**} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.userId;
    }

    // Authorities can manage alerts
    match /alerts/{document=**} {
      allow read: if true;
      allow write: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'authority';
    }

    // All can read models
    match /models/{document=**} {
      allow read: if true;
      allow write: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'analyst';
    }
  }
}
```

## Step 4: Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select your existing one
3. Enable these APIs:
   - Maps JavaScript API
   - Maps Embed API
   - Geocoding API

4. Go to Credentials → Create API Key
5. Add to `.env`:
   ```
   VITE_GOOGLE_MAPS_API_KEY=your_maps_api_key
   ```

## Step 5: Install Dependencies

```bash
cd frontend
npm install
```

## Step 6: Run Development Server

```bash
npm run dev
```

## Features Enabled

- ✅ User Registration (Citizen/Authority/Analyst roles)
- ✅ Email/Password Authentication
- ✅ User Profiles with Location
- ✅ Firestore Database Storage
- ✅ Role-based Access Control
- ✅ Live AQI Map with Google Maps
- ✅ Pollution Data Visualization

## Testing

1. Go to `http://localhost:5173`
2. Click "Login" button
3. Create a test account
4. Choose role (Citizen, Authority, or Analyst)
5. Enter your city/state
6. Explore the pollution map

## Troubleshooting

### Firebase initialization error
- Check `.env` file has all required keys
- Verify API keys are correct in Firebase Console
- Check that Authentication is enabled in Firebase

### Map not showing
- Verify Google Maps API key is valid
- Enable "Maps JavaScript API" in Google Cloud Console
- Check browser console for API errors

### Authentication fails
- Ensure "Email/Password" is enabled in Firebase Authentication
- Check Firestore Security Rules allow operations
- Verify CORS is configured correctly

## Next Steps

1. Deploy Firestore indexes if needed
2. Setup Firebase Hosting
3. Configure Email verification
4. Add Phone Number authentication
5. Setup Firebase Cloud Functions for backend logic
