// Case refs are stored and generated as UT-<BRANCHCODE>-<YYYYMM>-<sequence>
// (e.g. UT-CO01B-202610-0017). This is a display-only shortening used on case
// detail pages -- the stored value and generation logic are unchanged.
export function shortCaseRef(caseRef: string | null | undefined): string | null {
  if (!caseRef) return null;
  const parts = caseRef.split("-");
  if (parts.length !== 4 || parts[0] !== "UT") return caseRef;
  const [, branchCode, , seq] = parts;
  return `${branchCode}-${seq}`;
}

export function vehicleLabel(make: string | null, model: string | null, variant?: string | null): string {
  return [make, model, variant].filter(Boolean).join(" ") || "Vehicle";
}
