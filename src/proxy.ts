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
const STAFF_PATH_ROLES: Record<string, keyof typeof ROLE_HOME> = {
  "/admin": "manager",
  "/manager": "manager",
  "/po": "purchase_officer",
  "/so": "sales_officer",
};

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

  if (pathname.startsWith("/api")) return response;

  const staffRole = Object.entries(STAFF_PATH_ROLES).find(([path]) =>
    pathname.startsWith(path)
  )?.[1];

  if (staffRole) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === staffRole) return response;
    return NextResponse.redirect(
      new URL(profile ? ROLE_HOME[profile.role] : "/signup", request.url)
    );
  }

  if (pathname.startsWith("/broker")) {
    const { data: broker } = await supabase
      .from("brokers")
      .select("status")
      .eq("id", user.id)
      .maybeSingle();

    if (broker) return response;
  }

  // Authenticated public/unknown paths still need the user's home route.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

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

  const { data: broker } = await supabase
    .from("brokers")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();

  if (broker) {
    if (isPublic || !pathname.startsWith("/broker")) {
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
