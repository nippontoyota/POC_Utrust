import { AlertCircle } from "lucide-react";

export function BrokerLoadError({
  error,
  area = "reporting",
}: {
  error: { code: string; message: string };
  area?: "reporting" | "access";
}) {
  const needsSetup = [
    "PGRST202",
    "PGRST204",
    "PGRST205",
    "42703",
    "42883",
    "42P01",
  ].includes(error.code);
  console.warn(`Broker ${area} unavailable:`, error);

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-sm"
    >
      <AlertCircle
        aria-hidden="true"
        className="size-5 text-amber-600 dark:text-amber-400"
      />
      <div className="min-w-0">
        <p className="font-semibold">Broker {area} is unavailable</p>
        <p className="mt-1 text-[var(--muted)]">
          {needsSetup
            ? `Your administrator needs to finish setting up broker ${area}. Please try again once setup is complete.`
            : "Broker information could not be loaded. Please try again shortly."}
        </p>
      </div>
    </div>
  );
}
