import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Two-step query — avoids FK join syntax issues
  const { data: member } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (member?.org_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("slug")
      .eq("id", member.org_id)
      .single();

    if (org?.slug) {
      redirect(`/${org.slug}/upload`);
    }
  }

  // Logged in but no org — dedicated page to avoid /login redirect loop
  redirect("/welcome");
}
