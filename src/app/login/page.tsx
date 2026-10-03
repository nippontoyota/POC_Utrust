"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { employeeIdToAuthEmail } from "@/lib/employeeAuth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: employeeIdToAuthEmail(employeeId),
      password,
    });

    setLoading(false);

    if (error) {
      setError("Invalid Employee ID or password.");
      return;
    }

    router.refresh();
    router.push("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
            UT
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">UTrust POC</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Nippon Toyota Pre-Owned Cars</p>
        </div>

        <Card as="form" onSubmit={handleSubmit} className="space-y-4 shadow-sm">
          <FormField label="Employee ID">
            <input
              id="employeeId"
              type="text"
              name="username"
              autoComplete="username"
              required
              autoFocus
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={inputClass}
            />
          </FormField>

          <FormField label="Password">
            <input
              id="password"
              type="password"
              name="current-password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </FormField>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </Card>

        <div className="space-y-1 text-center text-sm text-zinc-500 dark:text-zinc-400">
          <p>
            Sales Officer or Purchase Officer?{" "}
            <Link href="/signup" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Create an account
            </Link>
          </p>
          <p>
            Broker?{" "}
            <Link href="/broker-signup" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Apply here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
