"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  ChartNoAxesCombined,
  UsersRound,
  CarFront,
  HandCoins,
  CalendarClock,
  History,
} from "lucide-react";

const icons = {
  dashboard: LayoutDashboard,
  cases: FolderOpen,
  performance: ChartNoAxesCombined,
  access: UsersRound,
  marketplace: CarFront,
  offers: HandCoins,
  reservations: CalendarClock,
  history: History,
};

export type RoleNavLink = {
  href: string;
  label: string;
  icon: keyof typeof icons;
};

export function RoleNav({
  links,
  collapsed = false,
  onNavigate,
}: {
  links: RoleNavLink[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="space-y-1">
      {links.map((link) => {
        const active =
          pathname === link.href ||
          pathname.startsWith(`${link.href}/`) ||
          (link.href === "/broker/dashboard" &&
            pathname.startsWith("/broker/vehicles/"));
        const Icon = icons[link.icon];
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={collapsed ? link.label : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${collapsed ? "justify-center" : ""} ${
              active
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)]"
            }`}
          >
            <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
            <span className={collapsed ? "sr-only" : "min-w-0"}>
              {link.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
