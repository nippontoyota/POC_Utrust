export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-8 w-12",
    md: "h-10 w-14",
    lg: "h-14 w-20",
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 96 64"
      className={`shrink-0 text-[var(--brand)] ${sizes[size]}`}
      fill="none"
    >
      <ellipse cx="48" cy="32" rx="42" ry="24" stroke="currentColor" strokeWidth="7" />
      <ellipse cx="48" cy="32" rx="14" ry="25" stroke="currentColor" strokeWidth="6" />
      <ellipse cx="48" cy="31" rx="28" ry="10" stroke="currentColor" strokeWidth="6" />
    </svg>
  );
}
