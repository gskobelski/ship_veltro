import { UploadForm } from "@/components/upload/upload-form";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

interface Props {
  params: { org: string };
}

export default async function UploadPage({ params }: Props) {
  const supabase = await createServerClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", params.org)
    .single();

  if (!org) redirect("/login");

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Prześlij dane miesięczne</h1>
        <p className="text-gray-500 mt-1">
          Wgraj 3 pliki Excel/CSV aby wygenerować raporty analityczne
        </p>
      </div>
      <UploadForm orgId={org.id} orgSlug={params.org} />
    </div>
  );
}
