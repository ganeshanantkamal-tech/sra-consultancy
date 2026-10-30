// Inline field checks for the master forms. Each returns an error message or ''.
// They mirror the server rules in server/masters.ts so the user sees problems before saving.
import { stateName } from '../../lib/states.js';

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function gstinError(value) {
  if (!value) return '';
  if (value.length !== 15) return `GSTIN must be exactly 15 characters (${value.length} entered).`;
  if (!GSTIN_RE.test(value)) return 'Invalid GSTIN format. Example: 27ABCDE1234F1Z5';
  if (!stateName(value.slice(0, 2))) return `${value.slice(0, 2)} is not a valid GST state code.`;
  return '';
}
export function panError(value, gstin = '') {
  if (!value) return '';
  if (value.length !== 10) return `PAN must be exactly 10 characters (${value.length} entered).`;
  if (!PAN_RE.test(value)) return 'Invalid PAN format. Example: ABCDE1234F';
  if (gstin.length === 15 && gstin.slice(2, 12) !== value) return 'PAN does not match the PAN inside the GSTIN.';
  return '';
}
// Accepts 10-digit mobiles and STD landlines, with or without +91 / 0 in front.
export function phoneError(value) {
  if (!value) return '';
  let digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10 || !/^\+?[0-9][0-9 -]{6,18}[0-9]$/.test(value.trim())) return 'Enter a 10-digit number, e.g. 9876543210';
  return '';
}
export const emailError = (value) => (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'Enter a valid email, e.g. client@example.com' : '');
export const pincodeError = (value) => (value && !/^\d{6}$/.test(value) ? 'Pincode must be 6 digits.' : '');
export const ifscError = (value) => (value && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(value) ? 'IFSC is 11 characters, e.g. HDFC0001234' : '');
export const stateMismatch = (gstin, stateCode) => (gstin && /^\d{2}/.test(gstin) && stateCode && gstin.slice(0, 2) !== stateCode
  ? `GSTIN belongs to ${stateName(gstin.slice(0, 2)) || gstin.slice(0, 2)}.` : '');

// Upper-cases a GSTIN as it's typed and derives the state code and PAN from it.
export function gstinPatch(raw, current) {
  const gstin = raw.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);
  const patch = { gstin };
  const code = gstin.slice(0, 2);
  if (/^\d{2}$/.test(code) && stateName(code) && code !== current.stateCode) Object.assign(patch, { stateCode: code, city: '' });
  if (gstin.length === 15 && GSTIN_RE.test(gstin) && !current.pan) patch.pan = gstin.slice(2, 12);
  return patch;
}

// Shows a field's error once it has been touched (blurred) or the form was submitted.
export function visibleErrors(errors, touched, submitted) {
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, (submitted || touched[k]) ? v : '']));
}
