import { SignOutButton } from "./SignOutButton";
import { ThemeToggle } from "./ui/ThemeToggle";

export function AppHeader({
  roleLabel,
  name,
  subtitle,
}: {
  roleLabel: string;
  name: string;
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
          UT
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">UTrust POC</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {roleLabel}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-zinc-700 dark:text-zinc-300 sm:inline">{name}</span>
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
