export function formatTelUri(phone: string): string {
  return phone.replace(/[\s\-\(\)\.]/g, '');
}
