"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { LogOut } from "lucide-react";

export function SignOutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  return (
    <Button
      variant="secondary"
      onClick={handleSignOut}
      aria-label="Sign out"
      title="Sign out"
      className={iconOnly ? "size-10 p-0!" : "whitespace-nowrap"}
    >
      <LogOut aria-hidden="true" className="size-4" />
      {!iconOnly && "Sign out"}
    </Button>
  );
}
