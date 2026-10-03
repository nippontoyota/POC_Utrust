export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-9 w-9 text-[10px]",
    md: "h-11 w-11 text-xs",
    lg: "h-14 w-14 text-sm",
  };

  return (
    <div
      aria-hidden="true"
      className={`relative grid shrink-0 place-items-center rounded-full bg-black font-black text-white shadow-[0_14px_35px_rgb(0_0_0/0.18)] ${sizes[size]}`}
    >
      <span className="leading-none">NT</span>
      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[var(--panel)] bg-[var(--brand)]" />
    </div>
  );
}
