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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
            UT
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Create staff account</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Sales Officer / Purchase Officer</p>
        </div>

        <Card as="form" onSubmit={handleSubmit} autoComplete="off" className="space-y-4 shadow-sm">
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

        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
