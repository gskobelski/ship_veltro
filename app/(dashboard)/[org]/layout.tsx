import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";

interface Props {
  children: React.ReactNode;
  params: { org: string };
}

export default async function OrgLayout({ children, params }: Props) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", params.org)
    .single();

  if (!org) redirect("/");

  const { data: member } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .single();

  if (!member) redirect("/");

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar orgSlug={params.org} orgName={org.name} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
