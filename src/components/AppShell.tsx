"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  X,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import { RoleNav, type RoleNavLink } from "./RoleNav";
import { SignOutButton } from "./SignOutButton";
import { ThemeToggle } from "./ui/ThemeToggle";

const iconButtonClass =
  "grid size-10 shrink-0 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";

export function AppShell({
  roleLabel,
  name,
  subtitle,
  links,
  children,
}: {
  roleLabel: string;
  name: string;
  subtitle?: string;
  links: RoleNavLink[];
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileMenu = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) mobileMenu.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  function openMenu() {
    mobileMenu.current?.showModal();
    setMenuOpen(true);
  }

  function closeMenu() {
    mobileMenu.current?.close();
  }

  function brand(compact: boolean) {
    return (
      <div
        className={`flex min-w-0 items-center gap-3 ${compact ? "justify-center" : ""}`}
      >
        <BrandMark size="sm" />
        <div className={compact ? "sr-only" : "min-w-0"}>
          <p className="text-sm font-bold">Nippon Toyota</p>
          <p className="text-xs font-medium text-[var(--muted)]">UTrust</p>
        </div>
      </div>
    );
  }

  function account(compact: boolean) {
    return (
      <div className="space-y-4 border-t border-[var(--line)] p-4">
        {!compact && (
          <div className="flex min-w-0 items-center gap-3">
            <UserRound
              aria-hidden="true"
              className="size-5 text-[var(--muted)]"
            />
            <div className="min-w-0">
              <p title={name} className="truncate text-sm font-semibold">
                {name}
              </p>
              {subtitle && (
                <p
                  title={subtitle}
                  className="truncate text-xs text-[var(--muted)]"
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        )}
        <div
          className={`flex gap-2 ${compact ? "flex-col items-center" : "items-center justify-between"}`}
        >
          <ThemeToggle />
          <SignOutButton iconOnly={compact} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="nt-shell min-h-dvh"
      style={
        { "--sidebar-width": collapsed ? "5rem" : "15rem" } as CSSProperties
      }
    >
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-[var(--foreground)] px-4 py-3 text-[var(--background)] focus:not-sr-only"
      >
        Skip to content
      </a>
      <aside
        aria-label="Workspace sidebar"
        className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] flex-col border-r border-[var(--line)] bg-[var(--panel)] lg:flex"
      >
        <div className="p-4 pt-6">
          {brand(collapsed)}
          <div
            className={`mt-6 flex items-center gap-2 ${collapsed ? "justify-center" : "justify-between"}`}
          >
            {!collapsed && (
              <p className="min-w-0 text-xs font-medium text-[var(--muted)]">
                {roleLabel}
              </p>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className={iconButtonClass}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-5" />
              ) : (
                <PanelLeftClose className="size-5" />
              )}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <RoleNav links={links} collapsed={collapsed} />
        </div>
        {account(collapsed)}
      </aside>

      <div className="min-w-0 lg:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-2 lg:hidden">
          <button
            type="button"
            onClick={openMenu}
            aria-label="Open navigation"
            title="Open navigation"
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
            className={iconButtonClass}
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Nippon Toyota UTrust</p>
            <p className="truncate text-xs text-[var(--muted)]">{roleLabel}</p>
          </div>
          <ThemeToggle />
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="@container min-w-0 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8"
        >
          {children}
        </main>
      </div>

      <dialog
        ref={mobileMenu}
        id="mobile-navigation"
        aria-label="Navigation"
        data-mobile-navigation
        onClose={() => setMenuOpen(false)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            closeMenu();
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-80 max-w-[calc(100%-2rem)] border-r border-[var(--line)] bg-[var(--panel)] p-0 text-[var(--foreground)] backdrop:bg-black/45"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-4">
            {brand(false)}
            <button
              type="button"
              autoFocus
              onClick={closeMenu}
              aria-label="Close navigation"
              title="Close navigation"
              className={iconButtonClass}
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <p className="mb-4 text-xs font-medium text-[var(--muted)]">
              {roleLabel}
            </p>
            <RoleNav links={links} onNavigate={closeMenu} />
          </div>
          {account(false)}
        </div>
      </dialog>
    </div>
  );
}
