import { Skeleton } from "@/components/ui/Skeleton";

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div className="max-w-2xl space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>
      <div className="flex shrink-0 gap-2">
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="min-w-0 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_20px_60px_rgb(33_25_20/0.07)] dark:shadow-none">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="size-10 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-8 w-16" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <Skeleton className="h-4 w-32" />
    </div>
  );
}

export function MarketplaceSkeleton() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      
      {/* Search Bar Skeleton */}
      <div className="grid gap-3 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_18px_55px_rgb(33_25_20/0.06)] sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-16 rounded-full" />
      </div>

      {/* List Skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="min-w-0 space-y-3 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_20px_60px_rgb(33_25_20/0.07)]">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-20 rounded-md" />
            </div>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-24 w-1/2 rounded-[1rem]" />
              <Skeleton className="h-24 w-1/2 rounded-[1rem]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CasesSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      
      {/* Filters Skeleton */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      {/* Cases List */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="block rounded-[1.25rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_16px_45px_rgb(33_25_20/0.06)]">
             <div className="mb-4 flex items-start justify-between gap-2">
               <Skeleton className="h-5 w-32" />
               <Skeleton className="h-5 w-24 rounded-full" />
             </div>
             <dl className="grid grid-cols-2 gap-x-3 gap-y-4">
                <div>
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div>
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div>
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div>
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
             </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
