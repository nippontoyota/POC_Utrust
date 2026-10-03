// Approximates "N business days" as Mon-Fri only, no holiday calendar
// (documented limitation -- see plan open decisions).
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

export function isOverdue(submittedAt: string | null, businessDaysThreshold: number): boolean {
  if (!submittedAt) return false;
  const deadline = addBusinessDays(new Date(submittedAt), businessDaysThreshold);
  return new Date() > deadline;
}
