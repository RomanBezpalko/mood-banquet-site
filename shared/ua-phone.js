function extractUaNationalDigits(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00380')) digits = digits.slice(5);
  else if (digits.startsWith('380')) digits = digits.slice(3);
  // A pasted national-format number may still include the domestic trunk zero.
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** Keep at most nine Ukrainian national digits for live input sanitization. */
export function sanitizeUaPhoneDigits(value) {
  return extractUaNationalDigits(value).slice(0, 9);
}

/** Return canonical E.164 format only when exactly 9 national digits exist. */
export function toUaE164(value) {
  const digits = extractUaNationalDigits(value);
  return digits.length === 9 ? `+380${digits}` : '';
}

/** Strict server-side normalization; rejects letters and unsupported symbols. */
export function normalizeUaPhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw || /[^\d+\s().-]/u.test(raw)) return '';
  return toUaE164(raw);
}

export function formatUaPhone(value) {
  const digits = sanitizeUaPhoneDigits(value);
  if (!digits) return '+380';
  const groups = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean);
  return `+380 ${groups.join(' ')}`;
}
