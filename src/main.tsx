import { createRoot } from 'react-dom/client';
import posthog from 'posthog-js';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './contexts/ThemeContext';

if (import.meta.env.VITE_POSTHOG_KEY) {
  try {
    posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
      autocapture: true,
      capture_pageleave: true,
      capture_pageview: false,
    });
  } catch (e) {
    console.warn('[PostHog] init failed:', e);
  }
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);

setTimeout(async () => {
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch { /* not in Capacitor */ }
}, 100);
