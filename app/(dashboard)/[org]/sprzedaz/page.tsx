import { importImpulsAction } from "@/app/actions/import-impuls";
import { ImportButton } from "@/components/import/import-button";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const FIELD_LABELS = {
  invoice_number: "Numer faktury",
  invoice_date: "Data wystawienia faktury",
  customer_code: "ID płatnika",
  net_value: "Wartość netto",
  wz_numbers: "Nr WZ",
};

interface Props {
  params: { org: string };
}

export default async function SprzedazPage({ params }: Props) {
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
        <h1 className="text-2xl font-bold text-gray-900">Sprzedaż z systemu</h1>
        <p className="mt-1 text-gray-500">
          Importuj pliki IMPULS i od razu aktualizuj powiązania WZ z przesyłkami.
        </p>
      </div>
      <ImportButton
        action={importImpulsAction}
        orgId={org.id}
        orgSlug={params.org}
        fileLabel="Plik IMPULS"
        fileDescription="Export sprzedaży z numerami faktur, płatników i numerami WZ."
        fileType="impuls"
        fieldLabels={FIELD_LABELS}
        requirePeriod
      />
    </div>
  );
}
