import { redirect } from "next/navigation";

export default function Home() {
  // Middleware already sends authenticated users to their role's dashboard
  // before this ever renders, so reaching here means: not signed in.
  redirect("/login");
}
