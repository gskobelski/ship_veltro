import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getReportByClient, getReportByInvoice, getReportByShipment } from "@/lib/reports/wz-matches";
import { ReportTable } from "@/components/zestawienia/report-table";
import { redirect } from "next/navigation";

interface Props {
  params: { org: string };
  searchParams?: { tab?: string };
}

const TABS = [
  { key: "invoice", label: "Po fakturze" },
  { key: "client", label: "Po kliencie" },
  { key: "shipment", label: "Po przesyłce" },
] as const;

export default async function ZestawieniaPage({ params, searchParams }: Props) {
  const supabase = await createServerClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", params.org)
    .single();

  if (!org) redirect("/login");

  const currentTab = TABS.some((tab) => tab.key === searchParams?.tab)
    ? (searchParams?.tab as "invoice" | "client" | "shipment")
    : "invoice";

  const [byInvoice, byClient, byShipment] = await Promise.all([
    getReportByInvoice(org.id),
    getReportByClient(org.id),
    getReportByShipment(org.id),
  ]);

  const content =
    currentTab === "client"
      ? {
          headers: ["ID klienta", "Nazwa klienta", "Wartość faktur", "Koszt transportu", "Liczba paczek"],
          rows: byClient.map((row) => [
            row.customer_code ?? "—",
            row.customer_name ?? "—",
            row.wartosc_faktur.toFixed(2),
            row.koszt_transportu.toFixed(2),
            row.liczba_paczek,
          ]),
        }
      : currentTab === "shipment"
      ? {
          headers: ["Nr przesyłki", "Nr WZ", "Nr faktur", "ID klienta", "Klient", "Wartość FV", "Koszt paczki", "Nr faktury kuriera"],
          rows: byShipment.map((row) => [
            row.shipment_number ?? "—",
            row.nr_wz || "—",
            row.nr_faktur || "—",
            row.customer_code ?? "—",
            row.customer_name ?? "—",
            row.wartosc_fv.toFixed(2),
            row.koszt_paczki.toFixed(2),
            row.carrier_invoice_number ?? "—",
          ]),
        }
      : {
          headers: ["Nr faktury", "Klient", "ID klienta", "Data sprzedaży", "Wartość FV", "Koszt transportu", "Liczba paczek", "Nr WZ"],
          rows: byInvoice.map((row) => [
            row.invoice_number,
            row.customer_name ?? "—",
            row.customer_code ?? "—",
            row.invoice_date ?? "—",
            row.wartosc_fv.toFixed(2),
            row.koszt_transportu.toFixed(2),
            row.liczba_paczek,
            row.nr_wz,
          ]),
        };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Zestawienia</h1>
        <p className="mt-1 text-gray-500">
          Raporty budowane na podstawie aktualnych powiązań numerów WZ, faktur i przesyłek.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const active = tab.key === currentTab;
          return (
            <Link
              key={tab.key}
              href={`/${params.org}/zestawienia?tab=${tab.key}`}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                active ? "bg-blue-600 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <ReportTable headers={content.headers} rows={content.rows} />
    </div>
  );
}
