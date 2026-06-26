import { signInAnonymously, RecaptchaVerifier, linkWithPhoneNumber, signInWithPhoneNumber } from 'firebase/auth';
import { Platform } from 'react-native';
import { auth } from '../firebase/firebaseApp';

// Ensures there is a signed-in user before a write. Falls back to anonymous
// auth so voting/commenting work immediately without forcing Google sign-in.
// If anonymous auth is disabled in the Firebase project, a clear error is thrown.
export async function ensureSignedIn() {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  try {
    const credential = await signInAnonymously(auth);
    return credential.user;
  } catch (error) {
    const code = error?.code || '';
    if (code.includes('operation-not-allowed') || code.includes('admin-restricted-operation')) {
      throw new Error(
        'Guest access is disabled. Enable Anonymous sign-in in Firebase Console → Authentication → Sign-in method, or sign in with Google.'
      );
    }
    throw error;
  }
}

// A friendly display name for the current user (handles anonymous guests).
export function displayNameFor(user) {
  if (!user) return 'Guest';
  if (user.displayName) return user.displayName;
  if (user.isAnonymous) return `Guest ${user.uid.slice(0, 4)}`;
  if (user.email) return user.email.split('@')[0];
  return `User ${user.uid.slice(0, 4)}`;
}

// ---------------------------------------------------------------------------
// Phone verification — the anti-multi-account gate for voting.
//
// A person can hold at most one Peopoll voting identity per phone number. By
// linking a verified phone to the account, votes can be restricted (in
// Firestore rules) to accounts that carry a phone_number token, so creating
// extra anonymous/Google accounts no longer grants extra votes.
// ---------------------------------------------------------------------------

// True when the signed-in account has a verified phone number linked.
export function isPhoneVerified(user) {
  const current = user || auth.currentUser;
  if (!current) return false;
  if (current.phoneNumber) return true;
  return (current.providerData || []).some((provider) => provider?.providerId === 'phone');
}

// Lazily builds an invisible reCAPTCHA verifier (web only). Firebase requires
// reCAPTCHA to issue the SMS challenge. The DOM container is created on demand
// and reused across attempts.
let recaptchaVerifier = null;
function getRecaptchaVerifier() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('Phone verification is currently available on the web app. Please open Peopoll in a browser to verify.');
  }
  if (recaptchaVerifier) {
    return recaptchaVerifier;
  }
  // Always start from a fresh container. grecaptcha throws "reCAPTCHA has
  // already been rendered in this element" if we render into a node that still
  // holds a previous widget (e.g. after a dev hot-reload or a reopened modal,
  // where this module-level ref resets but the DOM node persists).
  const existing = document.getElementById('recaptcha-container');
  if (existing) existing.remove();
  const container = document.createElement('div');
  container.id = 'recaptcha-container';
  container.style.display = 'none';
  document.body.appendChild(container);

  recaptchaVerifier = new RecaptchaVerifier(auth, container, { size: 'invisible' });
  return recaptchaVerifier;
}

function resetRecaptcha() {
  try {
    recaptchaVerifier?.clear?.();
  } catch {
    // ignore
  }
  recaptchaVerifier = null;
  // clear() detaches the widget but leaves the element behind, which still
  // trips the "already rendered" guard on the next attempt — remove it too.
  if (typeof document !== 'undefined') {
    document.getElementById('recaptcha-container')?.remove();
  }
}

// Normalises user input into E.164-ish form. Falls back to prefixing the given
// default dial code when the number has no country prefix.
export function normalizePhone(raw, defaultDialCode = '+1') {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/[^\d]/g, '')}`;
  }
  const digits = trimmed.replace(/[^\d]/g, '');
  return `${defaultDialCode}${digits}`;
}

// Sends an SMS verification code to `phoneNumber`. Links the phone to the
// current account so the user keeps their identity; if the number already
// belongs to another account it signs into that account instead (still one
// vote per number). Returns a confirmation handle for confirmPhoneCode.
export async function startPhoneVerification(phoneNumber) {
  const number = normalizePhone(phoneNumber);
  if (!/^\+\d{8,15}$/.test(number)) {
    throw new Error('Enter a valid phone number including country code, e.g. +14155552671.');
  }

  const user = await ensureSignedIn();
  const verifier = getRecaptchaVerifier();

  try {
    // Preferred: attach the phone to the account the user is already using.
    const confirmation = await linkWithPhoneNumber(user, number, verifier);
    return confirmation;
  } catch (error) {
    const code = error?.code || '';
    // Phone already tied to a different account — sign into that one so the
    // person still ends up with a single phone-backed identity.
    if (code.includes('credential-already-in-use') || code.includes('account-exists') || code.includes('provider-already-linked')) {
      resetRecaptcha();
      const verifier2 = getRecaptchaVerifier();
      return signInWithPhoneNumber(auth, number, verifier2);
    }
    resetRecaptcha();
    throw error;
  }
}

// Confirms the 6-digit SMS code against the pending verification handle.
export async function confirmPhoneCode(confirmation, code) {
  const clean = String(code || '').replace(/[^\d]/g, '');
  if (clean.length < 6) {
    throw new Error('Enter the 6-digit code from the text message.');
  }
  const result = await confirmation.confirm(clean);
  resetRecaptcha();
  return result.user;
}

