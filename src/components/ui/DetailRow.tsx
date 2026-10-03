export function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-zinc-900 dark:text-zinc-100">{value || "—"}</p>
    </div>
  );
}
