import type { ElementType, HTMLAttributes, ComponentPropsWithoutRef } from "react";

type CardProps<T extends ElementType> = {
  as?: T;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

export function Card<T extends ElementType = "div">({ as, className = "", ...props }: CardProps<T>) {
  const Component = as ?? "div";
  return (
    <Component
      className={`rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_24px_70px_rgb(33_25_20/0.08)] dark:shadow-none sm:p-6 ${className}`}
      {...props}
    />
  );
}

export function CardTitle({ className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={`mb-4 text-sm font-black uppercase tracking-[0.16em] text-zinc-900 dark:text-zinc-100 ${className}`}
      {...props}
    />
  );
}
