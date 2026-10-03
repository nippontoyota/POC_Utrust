const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return inr.format(amount);
}
