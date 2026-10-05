import Image from "next/image";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-8 w-12",
    md: "h-10 w-16",
    lg: "h-14 w-24",
  };

  return (
    <Image
      src="/logo.png"
      alt=""
      aria-hidden="true"
      width={632}
      height={395}
      priority
      className={`shrink-0 object-contain ${sizes[size]}`}
    />
  );
}
