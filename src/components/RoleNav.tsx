"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function RoleNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-[65px] z-10 flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white/90 px-6 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
