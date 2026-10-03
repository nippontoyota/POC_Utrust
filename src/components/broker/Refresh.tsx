"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}

export function Deadline({
  expiresAt,
  serverNow,
}: {
  expiresAt: string;
  serverNow: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(timer);
  }, [serverNow]);
  const minutes = Math.max(
    0,
    Math.ceil(
      (Date.parse(expiresAt) - Date.parse(serverNow) - elapsed) / 60000,
    ),
  );
  return (
    <span
      className={`tabular-nums ${minutes <= 120 ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}
      title={new Date(expiresAt).toLocaleString("en-IN")}
    >
      {minutes
        ? `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining`
        : "Reservation expired"}
    </span>
  );
}
