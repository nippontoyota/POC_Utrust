"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { enablePushNotifications, getExistingPushSubscription, isPushSupported } from "@/lib/pushClient";

type Status = "checking" | "unsupported" | "denied" | "enabled" | "available";

export function NotificationOptIn() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!isPushSupported()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const subscription = await getExistingPushSubscription();
      if (cancelled) return;
      setStatus(subscription && Notification.permission === "granted" ? "enabled" : "available");
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    setLoading(true);
    setError(null);
    try {
      await enablePushNotifications();
      setStatus("enabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications.");
      setStatus(Notification.permission === "denied" ? "denied" : "available");
    } finally {
      setLoading(false);
    }
  }

  if (status === "checking" || status === "unsupported") return null;

  if (status === "enabled") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 dark:text-green-400">
        <BellRing className="h-4 w-4" /> Notifications enabled
      </span>
    );
  }

  if (status === "denied") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)]">
        <BellOff className="h-4 w-4" /> Notifications blocked — allow them in your browser&apos;s site settings
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" onClick={handleEnable} disabled={loading}>
        <Bell className="h-4 w-4" /> {loading ? "Enabling…" : "Enable notifications"}
      </Button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
