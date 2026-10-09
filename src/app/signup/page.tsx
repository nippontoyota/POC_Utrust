"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { employeeIdToAuthEmail } from "@/lib/employeeAuth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BrandMark } from "@/components/BrandMark";
import type { Enums, Tables } from "@/lib/supabase/database.types";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [branches, setBranches] = useState<Tables<"branches">[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Enums<"app_role">>("sales_officer");
  const [branchId, setBranchId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("branches")
      .select("*")
      .order("display_order")
      .then(({ data }) => {
        if (data) {
          setBranches(data);
          if (data.length > 0) setBranchId(data[0].id);
        }
      });
  }, [supabase]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!branchId) {
      setError("Please select a branch.");
      return;
    }

    setLoading(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: employeeIdToAuthEmail(employeeId),
      password,
    });

    if (signUpError) {
      setLoading(false);
      setError(
        signUpError.message.toLowerCase().includes("already registered")
          ? "That Employee ID is already registered. Try signing in instead."
          : signUpError.message
      );
      return;
    }

    if (!signUpData.session) {
      setLoading(false);
      setError(
        "Account created, but this project still requires email confirmation, which can't reach an Employee ID. Ask the site owner to disable \"Confirm email\" in Supabase Auth settings, then try again."
      );
      return;
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: signUpData.user!.id,
      employee_id: employeeId.trim(),
      full_name: fullName.trim(),
      role,
      branch_id: branchId,
    });

    setLoading(false);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    router.refresh();
    router.push("/");
  }

  return (
    <main className="nt-shell relative min-h-screen overflow-hidden px-4 py-8">
      <div className="nt-route-lines pointer-events-none absolute inset-0" />
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="text-sm font-black text-zinc-950 dark:text-zinc-100">Nippon Toyota UTrust</p>
              <p className="text-xs font-medium text-[var(--muted)]">Staff onboarding</p>
            </div>
          </div>
          <div className="max-w-md">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--brand)]">Staff access</p>
            <h1 className="mt-3 text-4xl font-black leading-tight text-zinc-950 dark:text-zinc-100">Create a controlled workspace account.</h1>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              Sales Officers capture vehicles and RC book photos. Purchase Officers evaluate assigned cases.
            </p>
          </div>
        </div>

        <Card as="form" onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
          <FormField label="Employee ID">
            <input
              type="text"
              name="employee-id"
              autoComplete="off"
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={inputClass}
            />
          </FormField>

          <FormField label="Full name">
            <input
              type="text"
              name="full-name"
              autoComplete="off"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </FormField>

          <FormField label="Role">
            <select
              name="role"
              autoComplete="off"
              value={role}
              onChange={(e) => setRole(e.target.value as Enums<"app_role">)}
              className={inputClass}
            >
              <option value="sales_officer">Sales Officer</option>
              <option value="purchase_officer">Purchase Officer</option>
            </select>
          </FormField>

          <FormField label="Branch">
            <select
              name="branch"
              autoComplete="off"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className={inputClass}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Password">
            <input
              type="password"
              name="new-password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </FormField>

          <FormField label="Confirm password">
            <input
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </FormField>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </Card>

        <p className="text-center text-sm text-[var(--muted)] lg:col-start-2">
          Already have an account?{" "}
          <Link href="/login" className="font-black text-[var(--brand)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
