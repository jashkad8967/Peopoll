import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { Platform } from 'react-native';
import firebaseConfig from './firebaseConfig';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// ---------------------------------------------------------------------------
// App Check (bot/abuse protection for Firestore, Auth, etc.)
//
// 1. Firebase Console → App Check → register this web app with reCAPTCHA v3.
// 2. Paste the generated site key below (or set EXPO_PUBLIC_RECAPTCHA_SITE_KEY).
// 3. In the App Check console, enable enforcement for Firestore once verified.
//
// The site key is safe to expose in client code. App Check only runs on web
// and only when a key is present, so local dev and mobile are unaffected.
// ---------------------------------------------------------------------------
const RECAPTCHA_SITE_KEY =
  process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY || '6LcsO0ktAAAAAC7a7MFovLXJM5ho7T3QQdoL4Is9';

if (
  Platform.OS === 'web' &&
  typeof document !== 'undefined' &&
  RECAPTCHA_SITE_KEY &&
  RECAPTCHA_SITE_KEY !== 'YOUR_RECAPTCHA_V3_SITE_KEY'
) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    // Non-fatal: the app still runs if App Check fails to initialize.
    console.warn('App Check initialization failed', error?.message || error);
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;

