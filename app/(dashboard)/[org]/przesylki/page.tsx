import { importGlsAction } from "@/app/actions/import-gls";
import { ImportButton } from "@/components/import/import-button";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const FIELD_LABELS = {
  wz_numbers: "Nr WZ",
  shipping_cost: "Koszt netto",
  shipment_number: "Nr przesyłki",
  shipment_date: "Data wysyłki",
  customer_code: "Nr klienta",
  carrier_name: "Nazwa kuriera",
  carrier_invoice_number: "Nr faktury kuriera",
};

interface Props {
  params: { org: string };
}

export default async function PrzesylkiPage({ params }: Props) {
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
        <h1 className="text-2xl font-bold text-gray-900">Przesyłki</h1>
        <p className="mt-1 text-gray-500">
          Importuj raporty GLS i odświeżaj koszt transportu powiązany z numerami WZ.
        </p>
      </div>
      <ImportButton
        action={importGlsAction}
        orgId={org.id}
        orgSlug={params.org}
        fileLabel="Plik GLS"
        fileDescription="Raport przesyłek z kosztami, numerami WZ i danymi kuriera."
        fileType="gls"
        fieldLabels={FIELD_LABELS}
        requirePeriod
      />
    </div>
  );
}
