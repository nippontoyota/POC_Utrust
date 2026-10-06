export const EMAIL_PATTERN = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";
export const MOBILE_PATTERN = "^[0-9]{10}$";
export const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Indian vehicle registration numbers run 9-11 characters once normalized
// (e.g. KL01AB1234, DL1CAB1234, the newer 22BH1234AA Bharat-series) -- this
// bounds length only, not an exact shape, so an unusual but real plate never
// gets rejected.
export const VEHICLE_REG_MIN_LENGTH = 9;
export const VEHICLE_REG_MAX_LENGTH = 11;

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

export function normalizeVehicleRegNumber(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidVehicleRegNumber(value: string) {
  const length = normalizeVehicleRegNumber(value).length;
  return length >= VEHICLE_REG_MIN_LENGTH && length <= VEHICLE_REG_MAX_LENGTH;
}

export function isValidDateInput(value: string | undefined) {
  if (!value || !DATE_INPUT_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
