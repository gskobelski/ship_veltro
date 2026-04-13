import { importGlsAction } from "@/app/actions/import-gls";
import { ImportButton } from "@/components/import/import-button";
import { ShipmentsTable } from "@/components/przesylki/shipments-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ShipmentRecord } from "@/types";

const FIELD_LABELS = {
  wz_numbers: "Nr WZ",
  shipping_cost: "Koszt netto",
  shipment_number: "Nr przesyłki",
  shipment_date: "Data wysyłki",
  customer_code: "Nr klienta",
  carrier_name: "Nazwa kuriera",
  carrier_invoice_number: "Nr faktury kuriera",
};

const PAGE_SIZE = 50;

interface Props {
  params: { org: string };
  searchParams?: { page?: string };
}

export default async function PrzesylkiPage({ params, searchParams }: Props) {
  const supabase = await createServerClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", params.org)
    .single();

  if (!org) redirect("/login");

  const page = Math.max(0, Number(searchParams?.page ?? 0));

  const { data: shipments, count } = await supabase
    .from("shipments")
    .select("*", { count: "exact" })
    .eq("org_id", org.id)
    .order("shipment_date", { ascending: false, nullsFirst: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

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
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Zaimportowane przesyłki</h2>
        <ShipmentsTable orgId={org.id} shipments={(shipments ?? []) as ShipmentRecord[]} />
        <TablePagination
          page={page}
          total={count ?? 0}
          pageSize={PAGE_SIZE}
          basePath={`/${params.org}/przesylki`}
        />
      </div>
    </div>
  );
}
