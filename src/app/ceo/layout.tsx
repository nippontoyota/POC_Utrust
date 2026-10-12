import { getCurrentProfile } from "@/lib/supabase/auth";
import { BrandMark } from "@/components/BrandMark";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

// CEO has exactly one page -- deliberately no sidebar, no role nav. Just a
// slim top bar (brand, read-only badge, theme, sign out) above the dashboard.
export default async function CeoLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <div className="min-h-dvh bg-[var(--background)]">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size="sm" />
            <div className="hidden min-w-0 sm:block">
              <p className="text-sm font-bold leading-tight">Nippon Toyota</p>
              <p className="text-xs font-medium leading-tight text-[var(--muted)]">UTrust</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] sm:inline-flex">
              <span className="truncate max-w-[10rem]">{profile?.full_name ?? "CEO"}</span>
              <span aria-hidden="true">•</span>
              <span>Read only</span>
            </span>
            <ThemeToggle />
            <SignOutButton iconOnly />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
    </div>
  );
}
