import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-5 w-full max-w-sm" />
      </div>

      <div className="rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_18px_55px_rgb(33_25_20/0.06)]">
        <Skeleton className="h-11 w-full rounded-2xl" />
        <div className="mt-3 flex flex-wrap gap-3">
          <Skeleton className="h-11 w-36 rounded-2xl" />
          <Skeleton className="h-11 w-40 rounded-2xl" />
          <Skeleton className="h-10 w-20 rounded-full" />
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_16px_45px_rgb(33_25_20/0.06)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-7 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
