export function formatTelUri(phone: string): string {
  return phone.replace(/[\s\-().]/g, '');
}

const INDIAN_COUNTRY_CODE = '91';

export function normalizeIndianPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${INDIAN_COUNTRY_CODE}${digits}`;
  }
  if (digits.length === 12 && digits.startsWith(INDIAN_COUNTRY_CODE)) {
    return digits;
  }
  return null;
}
