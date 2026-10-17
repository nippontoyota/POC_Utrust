"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Phone, MessageSquare, Trophy, AlertCircle } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatINR } from "@/lib/formatCurrency";
import { createClient } from "@/lib/supabase/client";
import type { PanelBrokerBid } from "@/lib/panelBrokers";

export function PanelBrokerBidsLeaderboard({
  caseId,
  initialBids = [],
  status,
}: {
  caseId: string;
  initialBids?: PanelBrokerBid[];
  status: string;
}) {
  const [bids, setBids] = useState<PanelBrokerBid[]>(initialBids);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
    setLastRefreshed(new Date());
  }, []);

  const isEligible = ["listed_for_brokers", "broker_offer_selected", "broker_deal_closed"].includes(status);
  if (!isEligible) return null;

  async function fetchBids() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_panel_broker_bids", {
        p_case_id: caseId,
      });

      if (!error && Array.isArray(data)) {
        setBids(data as PanelBrokerBid[]);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch panel broker bids:", err);
    } finally {
      setLoading(false);
    }
  }

  // Poll for incoming WhatsApp replies every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      fetchBids();
    }, 10000);
    return () => clearInterval(timer);
  }, [caseId]);

  return (
    <Card className="border-[var(--line)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-amber-500" />
          <div>
            <CardTitle>Panel Broker WhatsApp Quotes</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Ranked in descending order by highest quoted price.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--muted)]" suppressHydrationWarning>
            Auto-refreshing · {mounted && lastRefreshed ? lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Live"}
          </span>
          <button
            type="button"
            onClick={fetchBids}
            disabled={loading}
            title="Refresh Quotes"
            className="rounded-lg border border-[var(--line)] p-1.5 text-zinc-600 transition hover:bg-[var(--panel-soft)] dark:text-zinc-300"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {bids.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--muted)]">
          <AlertCircle className="mx-auto mb-2 size-6 opacity-40" />
          <p>No WhatsApp quotes received yet.</p>
          <p className="mt-1 text-xs">
            When panel brokers reply to the WhatsApp broadcast with their price, their quotes will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                <th className="py-2.5 px-3">Rank</th>
                <th className="py-2.5 px-3">Broker Name</th>
                <th className="py-2.5 px-3">Place</th>
                <th className="py-2.5 px-3">Phone Number</th>
                <th className="py-2.5 px-3">Quoted Price</th>
                <th className="py-2.5 px-3">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {bids.map((bid, index) => {
                const isLeading = index === 0;
                return (
                  <tr
                    key={bid.id || `${bid.broker_mobile}-${index}`}
                    className={`transition ${
                      isLeading
                        ? "bg-amber-50/50 font-medium dark:bg-amber-950/20"
                        : "hover:bg-[var(--panel-soft)]"
                    }`}
                  >
                    <td className="py-3 px-3">
                      {isLeading ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          🥇 #1 Leading
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-zinc-500">#{index + 1}</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{bid.broker_name}</span>
                    </td>
                    <td className="py-3 px-3 text-xs text-[var(--muted)]">
                      {bid.place || "Kochi"}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="tabular-nums font-mono">{bid.broker_mobile}</span>
                        <a
                          href={`tel:${bid.broker_mobile}`}
                          title="Call Broker"
                          className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        >
                          <Phone className="size-3.5" />
                        </a>
                        <a
                          href={`https://wa.me/91${bid.broker_mobile}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Chat on WhatsApp"
                          className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        >
                          <MessageSquare className="size-3.5" />
                        </a>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`tabular-nums font-bold ${isLeading ? "text-emerald-600 dark:text-emerald-400 text-base" : "text-zinc-900 dark:text-zinc-100"}`}>
                        {formatINR(bid.bid_amount)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-[var(--muted)]" suppressHydrationWarning>
                      {mounted ? new Date(bid.received_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
