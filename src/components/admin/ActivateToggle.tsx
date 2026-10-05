"use client";

import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ActionFeedback, useAdminAction } from "./useAdminAction";

export function ActivateToggle({ profileId, isActive, isSelf }: { profileId: string; isActive: boolean; isSelf: boolean }) {
  const { busy, error, success, runRpc } = useAdminAction();

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={isActive ? "destructive" : "primary"}
        disabled={busy || (isSelf && isActive)}
        title={isSelf && isActive ? "You can't deactivate your own account." : undefined}
        onClick={() => runRpc("admin_set_profile_active", { p_profile_id: profileId, p_active: !isActive })}
      >
        {isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
        {isActive ? "Deactivate" : "Activate"}
      </Button>
      <ActionFeedback error={error} success={success} />
    </div>
  );
}
