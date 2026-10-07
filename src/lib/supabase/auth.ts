import { cache } from "react";
import { createClient } from "./server";

// cache() dedupes these within a single request's render tree, so a layout
// and the page(s) it wraps share one auth/profile round trip instead of each
// re-querying Supabase. Middleware still does its own check in proxy.ts --
// that runs before rendering starts, in a separate execution context, and is
// the actual security gate.

export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async () => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*, branches(name), clusters(name)")
    .eq("id", user.id)
    .single();

  return data;
});

export const getCurrentBroker = cache(async () => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("brokers")
    .select("company_name, status, suspended_at, broker_ref")
    .eq("id", user.id)
    .single();

  return data;
});
