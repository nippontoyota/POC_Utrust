"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { adminResetPassword } from "@/lib/actions/admin";
import { ActionFeedback, useAdminAction } from "./useAdminAction";

export function ResetPasswordForm({ userId, targetType }: { userId: string; targetType: "profile" | "broker" }) {
  const { busy, error, success, runServerAction } = useAdminAction();
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await runServerAction(adminResetPassword, { userId, newPassword: password, targetType });
    if (ok) setPassword("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <FormField label="New password" required>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className={inputClass}
        />
      </FormField>
      <ActionFeedback error={error} success={success} />
      <Button type="submit" variant="secondary" disabled={busy}>
        <KeyRound className="h-4 w-4" /> {busy ? "Resetting..." : "Reset Password"}
      </Button>
    </form>
  );
}
