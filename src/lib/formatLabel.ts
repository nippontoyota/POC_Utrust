// Turns a snake_case/enum-ish value (event_type, actor_role, fuel_type,
// transmission, ...) into a readable label, keeping known acronyms (PO, PTL,
// SO, CEO, CNG, RC) uppercase instead of letting a blind word-capitalize
// turn "po_assigned" into "Po Assigned" or "ptl" into "Ptl".
const ACRONYMS = new Set(["po", "ptl", "so", "ceo", "cng", "rc"]);

export function formatLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
