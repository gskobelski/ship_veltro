import { importImpulsAction } from "@/app/actions/import-impuls";
import { ImportButton } from "@/components/import/import-button";
import { InvoicesTable } from "@/components/sprzedaz/invoices-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { InvoiceRecord } from "@/types";

const FIELD_LABELS = {
  invoice_number: "Numer faktury",
  invoice_date: "Data wystawienia faktury",
  customer_code: "ID płatnika",
  net_value: "Wartość netto",
  wz_numbers: "Nr WZ",
};

const PAGE_SIZE = 50;

interface Props {
  params: { org: string };
  searchParams?: { page?: string };
}

export default async function SprzedazPage({ params, searchParams }: Props) {
  const supabase = await createServerClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", params.org)
    .single();

  if (!org) redirect("/login");

  const page = Math.max(0, Number(searchParams?.page ?? 0));

  const { data: invoices, count } = await supabase
    .from("invoices")
    .select("*", { count: "exact" })
    .eq("org_id", org.id)
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

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
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Zaimportowane faktury</h2>
        <InvoicesTable orgId={org.id} invoices={(invoices ?? []) as InvoiceRecord[]} />
        <TablePagination
          page={page}
          total={count ?? 0}
          pageSize={PAGE_SIZE}
          basePath={`/${params.org}/sprzedaz`}
        />
      </div>
    </div>
  );
}
