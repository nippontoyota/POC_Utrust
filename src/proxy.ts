import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

const ROLE_HOME: Record<string, string> = {
  sales_officer: "/so/dashboard",
  purchase_officer: "/po/dashboard",
  manager: "/manager/dashboard",
  sales_manager: "/manager/dashboard",
  cluster_manager: "/manager/dashboard",
  po_manager: "/manager/dashboard",
  admin: "/admin/dashboard",
};

const MANAGER_ROLES = new Set(["manager", "sales_manager", "cluster_manager", "po_manager"]);

const PUBLIC_PATHS = ["/login", "/signup", "/broker-signup", "/auth/callback"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user) {
    if (isPublic) return response;
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated. Figure out which "world" they belong to: staff (profiles) or broker.
  const [{ data: profile }, { data: broker }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("brokers").select("status").eq("id", user.id).maybeSingle(),
  ]);

  if (profile) {
    const home = ROLE_HOME[profile.role];
    const ownsPath =
      (profile.role === "sales_officer" && pathname.startsWith("/so")) ||
      (profile.role === "purchase_officer" && pathname.startsWith("/po")) ||
      (MANAGER_ROLES.has(profile.role) && pathname.startsWith("/manager")) ||
      (profile.role === "admin" && pathname.startsWith("/admin"));

    if (isPublic || (!ownsPath && !pathname.startsWith("/api"))) {
      return NextResponse.redirect(new URL(home, request.url));
    }
    return response;
  }

  if (broker) {
    if (isPublic || (!pathname.startsWith("/broker") && !pathname.startsWith("/api"))) {
      return NextResponse.redirect(new URL("/broker/dashboard", request.url));
    }
    return response;
  }

  // Authenticated in Supabase Auth but no profile/broker row yet (mid-signup edge case).
  if (!isPublic) {
    return NextResponse.redirect(new URL("/signup", request.url));
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icon$|apple-icon$|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
