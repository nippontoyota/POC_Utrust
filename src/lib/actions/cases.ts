"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createDraftCase() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("branch_id")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.branch_id) redirect("/login");

  const { data: newCase, error } = await supabase
    .from("cases")
    .insert({
      po_id: user.id,
      branch_id: profile.branch_id,
    })
    .select("id")
    .single();

  if (error || !newCase) {
    throw new Error(error?.message ?? "Failed to create case");
  }

  redirect(`/po/cases/${newCase.id}`);
}
