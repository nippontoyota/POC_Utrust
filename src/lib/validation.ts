export const EMAIL_PATTERN = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";
export const MOBILE_PATTERN = "^[0-9]{10}$";
export const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return new RegExp(EMAIL_PATTERN).test(normalizeEmail(value));
}

export function normalizeMobile(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function isValidMobile(value: string) {
  return new RegExp(MOBILE_PATTERN).test(normalizeMobile(value));
}

export function isValidDateInput(value: string | undefined) {
  if (!value || !DATE_INPUT_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
