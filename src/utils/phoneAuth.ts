import { formatUserFriendlyError } from '../lib/firestoreError';

export interface CountryDialOption {
  code: string;
  label: string;
  example: string;
}

export const COUNTRY_DIAL_CODES: CountryDialOption[] = [
  { code: '+92', label: 'PK (+92)', example: '300 1234567' },
  { code: '+1', label: 'US/CA (+1)', example: '415 555 0132' },
  { code: '+44', label: 'UK (+44)', example: '7700 900077' },
  { code: '+971', label: 'UAE (+971)', example: '50 123 4567' },
  { code: '+966', label: 'SA (+966)', example: '50 123 4567' },
  { code: '+91', label: 'IN (+91)', example: '98765 43210' },
  { code: '+61', label: 'AU (+61)', example: '412 345 678' },
  { code: '+49', label: 'DE (+49)', example: '151 23456789' },
  { code: '+86', label: 'CN (+86)', example: '138 0013 8000' },
];

/**
 * Normalizes a local or international phone input into strict E.164 format (e.g. +923001234567).
 * Returns null if the number does not satisfy E.164 length/character bounds.
 */
export function normalizePhoneToE164(rawInput: string, dialCode: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  let candidate = '';
  if (trimmed.startsWith('+')) {
    candidate = `+${trimmed.slice(1).replace(/\D/g, '')}`;
  } else {
    const cleanDial = dialCode.startsWith('+')
      ? `+${dialCode.slice(1).replace(/\D/g, '')}`
      : `+${dialCode.replace(/\D/g, '')}`;
    const localDigits = trimmed.replace(/\D/g, '').replace(/^0+/, '');
    if (!localDigits) return null;
    candidate = `${cleanDial}${localDigits}`;
  }

  return /^\+[1-9]\d{6,14}$/.test(candidate) ? candidate : null;
}

export function mapPhoneAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/operation-not-allowed') {
    return 'Phone sign-in is not enabled yet in Firebase Console -> Authentication -> Sign-in method -> Phone.';
  }
  if (code === 'auth/invalid-phone-number' || code === 'auth/missing-phone-number') {
    return 'Please enter a valid mobile number with country code (e.g., +92 300 1234567).';
  }
  if (code === 'auth/captcha-check-failed' || code === 'auth/invalid-app-credential') {
    return 'reCAPTCHA verification failed. Ensure your current domain is added in Firebase Console -> Authentication -> Settings -> Authorized domains, then try again.';
  }
  if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') {
    return 'Too many verification attempts right now. Please wait a moment and try again.';
  }
  if (code === 'auth/billing-not-enabled') {
    return 'Live SMS delivery requires Firebase Blaze billing or a Firebase Console test phone number in Authentication -> Sign-in method -> Phone.';
  }
  if (code === 'auth/invalid-verification-code') {
    return 'The 6-digit verification code is incorrect. Check the SMS and try again.';
  }
  if (code === 'auth/code-expired' || code === 'auth/session-expired') {
    return 'This verification code has expired. Tap Resend Code to get a new SMS.';
  }
  if (code === 'auth/credential-already-in-use') {
    return 'This phone number is already linked to another Hostel Friend account.';
  }
  if (code === 'auth/provider-already-linked') {
    return 'A phone number is already verified on this account.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'For security, please sign out and sign back in right before linking a phone number.';
  }
  if (code === 'auth/web-storage-unsupported') {
    return 'Browser storage is restricted in this frame. Allow third-party cookies/storage or open in a full browser tab.';
  }
  return formatUserFriendlyError(err, 'Phone verification failed. Please try again.');
}
