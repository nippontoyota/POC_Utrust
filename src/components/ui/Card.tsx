import type { ElementType, HTMLAttributes } from "react";

type CardProps<T extends ElementType> = {
  as?: T;
} & Omit<HTMLAttributes<HTMLElement>, "as">;

export function Card<T extends ElementType = "div">({ as, className = "", ...props }: CardProps<T>) {
  const Component = as ?? "div";
  return (
    <Component
      className={`rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
      {...props}
    />
  );
}

export function CardTitle({ className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={`mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${className}`}
      {...props}
    />
  );
}
