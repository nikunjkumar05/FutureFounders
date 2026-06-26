import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Disable analytics in Capacitor (requires native SDK)
let isCapacitor = false;
try {
  const { Capacitor } = await import('@capacitor/core');
  isCapacitor = Capacitor.isNativePlatform();
} catch {
  // Not in Capacitor
}

if (!isCapacitor) {
  try {
    const { getAnalytics } = await import('firebase/analytics');
    getAnalytics(app);
  } catch {
    // Analytics not available
  }
}
