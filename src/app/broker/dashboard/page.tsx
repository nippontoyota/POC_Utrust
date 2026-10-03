import { EmptyState } from "@/components/ui/EmptyState";

export default function BrokerDashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
      <EmptyState message="The marketplace and bidding land in Phase 5. Your broker account is approved." />
    </div>
  );
}
