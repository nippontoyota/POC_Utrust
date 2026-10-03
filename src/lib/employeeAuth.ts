// Supabase Auth is email/password based. Staff sign in with an Employee ID, not
// an email, so we deterministically map Employee ID -> a synthetic, never-emailed
// address purely for Supabase's own bookkeeping. Login recomputes the same value
// from the Employee ID -- no database lookup is needed before authenticating.
//
// Note: the domain must have a real-looking TLD (Supabase's email validator
// rejects unregistered TLDs like ".internal" as malformed), but it's never
// actually sent mail, so it doesn't need to resolve to anything.
export function employeeIdToAuthEmail(employeeId: string): string {
  const normalized = employeeId.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${normalized}@staff.utrustpoc.com`;
}

export function normalizeEmployeeId(employeeId: string): string {
  return employeeId.trim();
}
