"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  name: string;
  resetPage?: boolean;
};

export function AutoFilterSelect({ name, resetPage = true, ...props }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <select
      {...props}
      name={name}
      onChange={(event) => {
        props.onChange?.(event);

        const params = new URLSearchParams(searchParams);
        const value = event.currentTarget.value;

        if (value) params.set(name, value);
        else params.delete(name);
        if (resetPage) params.delete("page");

        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
      }}
    />
  );
}
