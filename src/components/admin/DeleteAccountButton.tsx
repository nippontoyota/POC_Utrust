"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { adminDeleteAccount } from "@/lib/actions/admin";
import { ActionFeedback, useAdminAction } from "./useAdminAction";

export function DeleteAccountButton({ profileId, isSelf }: { profileId: string; isSelf: boolean }) {
  const router = useRouter();
  const { busy, error, success, runServerAction } = useAdminAction();
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const ok = await runServerAction(adminDeleteAccount, { userId: profileId });
    if (ok) router.push("/admin/users");
  }

  if (isSelf) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">You can&apos;t delete your own account.</p>;
  }

  if (!confirming) {
    return (
      <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
        <Trash2 className="h-4 w-4" /> Delete Account
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        This permanently deletes the login and profile -- this can&apos;t be undone. Accounts with any
        case, offer, photo, or event history can&apos;t be deleted; deactivate those instead.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="destructive" disabled={busy} onClick={handleDelete}>
          {busy ? "Deleting..." : "Yes, delete permanently"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
      <ActionFeedback error={error} success={success} />
    </div>
  );
}
