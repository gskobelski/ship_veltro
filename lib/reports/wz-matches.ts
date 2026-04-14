import { createServerClient } from "../supabase/server";
import type { ReportByClient, ReportByInvoice, ReportByShipment, WzMatch } from "../../types";

type ShipmentLookup = {
  id: string;
  shipment_number: string;
};

async function fetchWzRows(orgId: string): Promise<WzMatch[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("wz_matches")
    .select("*")
    .eq("org_id", orgId)
    .order("invoice_date", { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(`Fetch wz_matches: ${error.message}`);
  }

  return (data ?? []) as WzMatch[];
}

async function fetchShipmentLookup(orgId: string): Promise<Map<string, string>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("shipments")
    .select("id, shipment_number")
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Fetch shipments for report: ${error.message}`);
  }

  return new Map((data ?? []).map((shipment) => [(shipment as ShipmentLookup).id, (shipment as ShipmentLookup).shipment_number]));
}

export async function getReportByInvoice(orgId: string): Promise<ReportByInvoice[]> {
  const rows = await fetchWzRows(orgId);
  const grouped = new Map<string, ReportByInvoice>();

  for (const row of rows) {
    const key = row.invoice_number ?? `missing-${row.wz_number}`;
    const current = grouped.get(key) ?? {
      invoice_number: row.invoice_number ?? "—",
      customer_code: row.customer_code,
      customer_name: row.customer_name,
      invoice_date: row.invoice_date,
      wartosc_fv: 0,
      koszt_transportu: 0,
      liczba_paczek: 0,
      nr_wz: "",
    };

    current.wartosc_fv += row.net_value;
    current.koszt_transportu += row.shipping_cost;
    current.liczba_paczek += row.parcels_count;
    current.nr_wz = [current.nr_wz, row.wz_number].filter(Boolean).join(current.nr_wz ? ", " : "");

    grouped.set(key, current);
  }

  return Array.from(grouped.values());
}

export async function getReportByClient(orgId: string): Promise<ReportByClient[]> {
  const rows = await fetchWzRows(orgId);
  const grouped = new Map<string, ReportByClient>();

  for (const row of rows) {
    const key = row.customer_code ?? `missing-${row.wz_number}`;
    const current = grouped.get(key) ?? {
      customer_code: row.customer_code,
      customer_name: row.customer_name,
      wartosc_faktur: 0,
      koszt_transportu: 0,
      liczba_paczek: 0,
    };

    current.wartosc_faktur += row.net_value;
    current.koszt_transportu += row.shipping_cost;
    current.liczba_paczek += row.parcels_count;

    grouped.set(key, current);
  }

  return Array.from(grouped.values());
}

export async function getReportByShipment(orgId: string): Promise<ReportByShipment[]> {
  const [rows, shipmentLookup] = await Promise.all([
    fetchWzRows(orgId),
    fetchShipmentLookup(orgId),
  ]);
  const grouped = new Map<string, ReportByShipment>();

  for (const row of rows) {
    const shipmentNumber = row.shipment_id ? shipmentLookup.get(row.shipment_id) ?? null : null;
    const key = shipmentNumber ?? `missing-${row.wz_number}`;
    const current = grouped.get(key) ?? {
      shipment_number: shipmentNumber,
      nr_faktur: "",
      nr_wz: "",
      customer_code: row.customer_code,
      customer_name: row.customer_name,
      wartosc_fv: 0,
      koszt_paczki: 0,
      carrier_invoice_number: row.carrier_invoice_number,
    };

    current.wartosc_fv += row.net_value;
    current.koszt_paczki += row.shipping_cost;
    if (row.invoice_number) {
      current.nr_faktur = [current.nr_faktur, row.invoice_number].filter(Boolean).join(current.nr_faktur ? ", " : "");
    }
    if (row.wz_number) {
      current.nr_wz = [current.nr_wz, row.wz_number].filter(Boolean).join(current.nr_wz ? ", " : "");
    }

    grouped.set(key, current);
  }

  return Array.from(grouped.values());
}
