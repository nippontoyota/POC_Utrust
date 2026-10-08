"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Car, Eye, EyeOff, LoaderCircle, Store, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { employeeIdToAuthEmail } from "@/lib/employeeAuth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BrandMark } from "@/components/BrandMark";
import { EMAIL_PATTERN, isValidEmail, normalizeEmail } from "@/lib/validation";

const ROLE_HOME: Record<string, string> = {
  purchase_officer: "/po/dashboard",
  manager: "/manager/dashboard",
  sales_manager: "/manager/dashboard",
  cluster_manager: "/manager/dashboard",
  po_manager: "/manager/dashboard",
  admin: "/admin/dashboard",
};

export default function LoginPage() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [mode, setMode] = useState<"staff" | "broker">("staff");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);
    const username =
      mode === "broker" ? normalizeEmail(employeeId) : employeeId.trim();

    if (mode === "broker" && !isValidEmail(username)) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email:
        mode === "broker"
          ? username
          : employeeIdToAuthEmail(username),
      password,
    });

    if (error) {
      setError(
        mode === "broker"
          ? "Invalid email or password."
          : "Invalid Employee ID or password.",
      );
      setLoading(false);
      return;
    }

    const userId = signInData.user?.id;
    const target = userId
      ? mode === "broker"
        ? "/broker/dashboard"
        : await getStaffHome(supabase, userId)
      : "/";

    router.replace(target);
  }

  return (
    <main className="nt-shell relative flex min-h-dvh items-center justify-center px-4 py-20 sm:px-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <section aria-label="Sign in" className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-3">
          <BrandMark />
          <div>
            <p className="text-sm font-black text-zinc-950 dark:text-zinc-100">
              Nippon Toyota UTrust
            </p>
            <p className="text-xs font-medium text-[var(--muted)]">
              Pre-owned cars
            </p>
          </div>
        </div>
        <Card as="form" onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--brand)]">
              Welcome back
            </p>
            <h1 className="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100">
              Sign in to your workspace
            </h1>
          </div>

          <div
            className="grid grid-cols-2 gap-2 rounded-full border border-[var(--line)] bg-[var(--panel-soft)] p-1"
            aria-label="Account type"
          >
            {(["staff", "broker"] as const).map((value) => {
              const active = mode === value;
              const Icon = value === "staff" ? UserRound : Store;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  disabled={loading}
                  onClick={() => {
                    setMode(value);
                    setEmployeeId("");
                    setError(null);
                  }}
                  className={`inline-flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-black capitalize transition ${
                    active
                      ? "bg-black text-white shadow-[0_10px_28px_rgb(0_0_0/0.18)] dark:bg-white dark:text-black"
                      : "text-[var(--muted)] hover:text-zinc-950 dark:hover:text-zinc-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {value}
                </button>
              );
            })}
          </div>

          <FormField label={mode === "broker" ? "Email" : "Employee ID"}>
            <input
              id="employeeId"
              type={mode === "broker" ? "email" : "text"}
              name="username"
              autoComplete="username"
              pattern={mode === "broker" ? EMAIL_PATTERN : undefined}
              title={mode === "broker" ? "Enter a valid email address." : undefined}
              required
              autoFocus
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={loading}
              className={inputClass}
            />
          </FormField>

          <FormField label="Password">
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                name="current-password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className={`${inputClass} pr-12`}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={loading}
                className="absolute right-3 top-[calc(50%+0.125rem)] inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-black/5 hover:text-zinc-950 focus:outline-none focus:ring-4 focus:ring-red-500/10 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="size-4" />
                ) : (
                  <Eye aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>
          </FormField>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            {loading ? "Signing in" : "Sign in"}
          </Button>
        </Card>

        <div className="space-y-3">
          <p className="text-center text-sm text-[var(--muted)]">
            New to UTrust?
          </p>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Link
              href="/signup"
              className="flex items-start gap-3 rounded-[1.25rem] border border-[var(--line)] bg-[var(--panel)] px-4 py-4 text-zinc-900 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--brand)] dark:text-zinc-100"
            >
              <UserRound
                aria-hidden="true"
                className="mt-0.5 size-5 text-[var(--brand)]"
              />
              <span className="min-w-0">
                <span className="block font-semibold">
                  Create staff account
                </span>
                <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                  For sales and purchase officers.
                </span>
              </span>
            </Link>
            <Link
              href="/broker-signup"
              className="flex items-start gap-3 rounded-[1.25rem] border border-[var(--line)] bg-[var(--panel)] px-4 py-4 text-zinc-900 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--brand)] dark:text-zinc-100"
            >
              <Car
                aria-hidden="true"
                className="mt-0.5 size-5 text-[var(--brand)]"
              />
              <span className="min-w-0">
                <span className="block font-semibold">Apply as a broker</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                  Marketplace access after approval.
                </span>
              </span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

async function getStaffHome(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return profile ? ROLE_HOME[profile.role] : "/";
}
