import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ai-climate-intelligence-app.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ai-climate-intelligence-app",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ai-climate-intelligence-app.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "140710923073",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:140710923073:web:a14107d45ab30a55c0afc0",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-MK0F10W0GQ"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
