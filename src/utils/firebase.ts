import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAbh8i96MYkjztsWPRYLF7xcDBLycrEu0I",
  authDomain: "vipapp-schedule.firebaseapp.com",
  projectId: "vipapp-schedule",
  storageBucket: "vipapp-schedule.firebasestorage.app",
  messagingSenderId: "231396570699",
  appId: "1:231396570699:android:00a02c25386b400923bfce"
};

// Initialize Firebase App singleton
export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firebaseAuth = getAuth(firebaseApp);
