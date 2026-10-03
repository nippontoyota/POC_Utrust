"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BrandMark } from "@/components/BrandMark";
import {
  EMAIL_PATTERN,
  MOBILE_PATTERN,
  isValidEmail,
  isValidMobile,
  normalizeEmail,
  normalizeMobile,
} from "@/lib/validation";

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
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizeMobile(phone);

    if (!isValidMobile(normalizedPhone)) {
      setError("Enter a valid 10 digit mobile number.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
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
      email: normalizedEmail,
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
      phone: normalizedPhone,
      email: normalizedEmail,
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
      <main className="nt-shell flex min-h-screen items-center justify-center px-4">
        <div className="fixed right-4 top-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-sm space-y-4 text-center">
          <div className="mx-auto flex justify-center">
            <BrandMark size="lg" />
          </div>
          <h1 className="text-2xl font-black text-zinc-950 dark:text-zinc-100">Application received</h1>
          <p className="text-sm leading-6 text-[var(--muted)]">
            Your broker account is pending approval. You&apos;ll be able to sign in and browse
            listings once the UTrust team approves your application.
          </p>
          <Link href="/login" className="inline-block text-sm font-black text-[var(--brand)] hover:underline">
            Back to sign in
          </Link>
        </Card>
      </main>
    );
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
              <p className="text-xs font-medium text-[var(--muted)]">Broker marketplace access</p>
            </div>
          </div>
          <div className="max-w-md">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--brand)]">Broker application</p>
            <h1 className="mt-3 text-4xl font-black leading-tight text-zinc-950 dark:text-zinc-100">Get approved to bid on listed vehicles.</h1>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              Approved brokers can view broker-safe vehicle photos, submit private offers, and reserve selected deals.
            </p>
          </div>
        </div>

        <Card as="form" onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
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
              autoComplete="tel-national"
              inputMode="numeric"
              pattern={MOBILE_PATTERN}
              title="Enter a 10 digit mobile number."
              required
              value={phone}
              onChange={(e) => setPhone(normalizeMobile(e.target.value))}
              className={inputClass}
            />
          </FormField>

          <FormField label="Email">
            <input
              type="email"
              name="email"
              autoComplete="email"
              pattern={EMAIL_PATTERN}
              title="Enter a valid email address."
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

        <p className="text-center text-sm text-[var(--muted)] lg:col-start-2">
          Staff member?{" "}
          <Link href="/login" className="font-black text-[var(--brand)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
