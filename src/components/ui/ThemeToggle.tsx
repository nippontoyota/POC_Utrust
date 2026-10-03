"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_EVENT = "utrust-theme-change";

function resolveIsDark() {
  try {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
  } catch {}
  return false;
}

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
  };
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, resolveIsDark, () => false);

  function toggle() {
    const next = !isDark;
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-zinc-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--panel-soft)] dark:text-zinc-200"
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
