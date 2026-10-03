"use client";

import { useLayoutEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

function resolveIsDark(): boolean {
  try {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  // Runs before paint, after hydration: syncs this component's state with the
  // value the head script already applied, and re-applies it in case React's
  // dev Strict Mode remount reset the <html> attribute to its JSX default.
  useLayoutEffect(() => {
    const dark = resolveIsDark();
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    setIsDark(dark);
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
