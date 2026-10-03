"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function BrokerSignupPage() {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

    setLoading(true);
    const supabase = createClient();

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setLoading(false);
      setError(
        signUpError.message.toLowerCase().includes("already registered")
          ? "An account with that email already exists. Try signing in instead."
          : signUpError.message
      );
      return;
    }

    if (!signUpData.session) {
      setLoading(false);
      setError(
        "This project still requires email confirmation, which will block your application. Ask the site owner to disable \"Confirm email\" in Supabase Auth settings, then try again."
      );
      return;
    }

    const { error: brokerError } = await supabase.from("brokers").insert({
      id: signUpData.user!.id,
      company_name: companyName.trim(),
      contact_name: contactName.trim(),
      phone: phone.trim(),
      email,
    });

    setLoading(false);

    if (brokerError) {
      setError(brokerError.message);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="fixed top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-sm space-y-4 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Application received</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Your broker account is pending approval. You&apos;ll be able to sign in and browse
            listings once the UTrust team approves your application.
          </p>
          <Link href="/login" className="inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
            Back to sign in
          </Link>
        </Card>
      </div>
    );
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
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Broker application</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Apply for access to the UTrust marketplace</p>
        </div>

        <Card as="form" onSubmit={handleSubmit} autoComplete="off" className="space-y-4 shadow-sm">
          <FormField label="Company name">
            <input
              type="text"
              name="company-name"
              autoComplete="off"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={inputClass}
            />
          </FormField>

          <FormField label="Contact name">
            <input
              type="text"
              name="contact-name"
              autoComplete="off"
              required
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className={inputClass}
            />
          </FormField>

          <FormField label="Phone">
            <input
              type="tel"
              name="phone"
              autoComplete="off"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </FormField>

          <FormField label="Email">
            <input
              type="email"
              name="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
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
            {loading ? "Submitting..." : "Submit application"}
          </Button>
        </Card>

        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          Staff member?{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
