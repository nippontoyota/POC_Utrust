import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Bypasses RLS entirely. Only ever import this in server-only code (Route
// Handlers, Server Actions, scripts) that applies its own explicit
// authorization checks before touching data -- never in a client component,
// and never pass its results straight through without checking who's asking.
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
