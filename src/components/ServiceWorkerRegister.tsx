"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: app works fine without it, just isn't installable.
      });
    }
  }, []);

  return null;
}
