const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return inr.format(amount);
}

// Compact Indian form for headline numbers: ₹2.04 Cr, ₹72 L, ₹8,000.
export function formatINRCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const abs = Math.abs(amount);
  if (abs >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(amount % 1_00_000 === 0 ? 0 : 1)} L`;
  return formatINR(amount);
}
