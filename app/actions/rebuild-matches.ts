import { createServiceClient } from "../../lib/supabase/server";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_code: string;
  customer_name: string | null;
  net_value: number;
  wz_numbers: string[];
}

interface ShipmentRow {
  id: string;
  shipment_number: string;
  wz_number: string | null;
  shipping_cost: number | null;
  parcels_count: number;
  carrier_name: string | null;
  carrier_invoice_number: string | null;
}

interface WzMatchInsert {
  org_id: string;
  wz_number: string;
  invoice_id: string | null;
  shipment_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  customer_code: string | null;
  customer_name: string | null;
  net_value: number;
  shipping_cost: number;
  parcels_count: number;
  carrier_name: string | null;
  carrier_invoice_number: string | null;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function distributeInteger(total: number, parts: number): number[] {
  if (parts <= 0) return [];

  const base = Math.floor(total / parts);
  let remainder = total % parts;

  return Array.from({ length: parts }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return value;
  });
}

function buildShipmentCostByWz(shipments: ShipmentRow[]): Map<string, number> {
  const grouped = new Map<string, ShipmentRow[]>();

  for (const shipment of shipments) {
    if (!shipment.wz_number) continue;
    const key = shipment.shipment_number || shipment.id;
    const current = grouped.get(key) ?? [];
    current.push(shipment);
    grouped.set(key, current);
  }

  const costByWz = new Map<string, number>();

  for (const group of Array.from(grouped.values())) {
    const wzCount = group.length;
    const totalCost = group[0]?.shipping_cost ?? 0;
    const costPerWz = wzCount > 0 ? roundCurrency(totalCost / wzCount) : 0;

    for (const shipment of group) {
      if (shipment.wz_number) {
        costByWz.set(shipment.wz_number, costPerWz);
      }
    }
  }

  return costByWz;
}

function buildShipmentParcelsByWz(shipments: ShipmentRow[]): Map<string, number> {
  const grouped = new Map<string, ShipmentRow[]>();

  for (const shipment of shipments) {
    if (!shipment.wz_number) continue;
    const key = shipment.shipment_number || shipment.id;
    const current = grouped.get(key) ?? [];
    current.push(shipment);
    grouped.set(key, current);
  }

  const parcelsByWz = new Map<string, number>();

  for (const group of Array.from(grouped.values())) {
    const distribution = distributeInteger(group[0]?.parcels_count ?? 0, group.length);

    group.forEach((shipment, index) => {
      if (shipment.wz_number) {
        parcelsByWz.set(shipment.wz_number, distribution[index] ?? 0);
      }
    });
  }

  return parcelsByWz;
}

function buildInvoiceValueByWz(invoices: InvoiceRow[]): Map<string, number> {
  const valuesByWz = new Map<string, number>();

  for (const invoice of invoices) {
    const wzCount = invoice.wz_numbers.length || 1;
    const valuePerWz = roundCurrency(invoice.net_value / wzCount);

    invoice.wz_numbers.forEach((wz) => {
      if (wz) {
        valuesByWz.set(wz, valuePerWz);
      }
    });
  }

  return valuesByWz;
}

export function buildWzMatchRows(
  orgId: string,
  invoices: InvoiceRow[],
  shipments: ShipmentRow[]
): WzMatchInsert[] {
  const shipmentsByWz = new Map<string, ShipmentRow>();
  const invoicesByWz = new Map<string, InvoiceRow>();
  const allWz = new Set<string>();

  for (const invoice of invoices) {
    for (const wz of invoice.wz_numbers) {
      if (!wz) continue;
      allWz.add(wz);
      if (!invoicesByWz.has(wz)) {
        invoicesByWz.set(wz, invoice);
      }
    }
  }

  for (const shipment of shipments) {
    if (!shipment.wz_number) continue;
    allWz.add(shipment.wz_number);
    if (!shipmentsByWz.has(shipment.wz_number)) {
      shipmentsByWz.set(shipment.wz_number, shipment);
    }
  }

  const costByWz = buildShipmentCostByWz(shipments);
  const parcelsByWz = buildShipmentParcelsByWz(shipments);
  const invoiceValueByWz = buildInvoiceValueByWz(invoices);

  return Array.from(allWz)
    .sort()
    .map((wzNumber) => {
      const invoice = invoicesByWz.get(wzNumber) ?? null;
      const shipment = shipmentsByWz.get(wzNumber) ?? null;

      return {
        org_id: orgId,
        wz_number: wzNumber,
        invoice_id: invoice?.id ?? null,
        shipment_id: shipment?.id ?? null,
        invoice_number: invoice?.invoice_number ?? null,
        invoice_date: invoice?.invoice_date ?? null,
        customer_code: invoice?.customer_code ?? null,
        customer_name: invoice?.customer_name ?? null,
        net_value: invoiceValueByWz.get(wzNumber) ?? 0,
        shipping_cost: costByWz.get(wzNumber) ?? 0,
        parcels_count: parcelsByWz.get(wzNumber) ?? 0,
        carrier_name: shipment?.carrier_name ?? null,
        carrier_invoice_number: shipment?.carrier_invoice_number ?? null,
      };
    });
}

export async function rebuildWzMatchesAction(orgId: string): Promise<void> {
  "use server";

  const serviceClient = await createServiceClient();

  const { data: invoices, error: invoiceError } = await serviceClient
    .from("invoices")
    .select("id, invoice_number, invoice_date, customer_code, customer_name, net_value, wz_numbers")
    .eq("org_id", orgId);

  if (invoiceError) {
    throw new Error(`Fetch invoices: ${invoiceError.message}`);
  }

  const { data: shipments, error: shipmentError } = await serviceClient
    .from("shipments")
    .select("id, shipment_number, wz_number, shipping_cost, parcels_count, carrier_name, carrier_invoice_number")
    .eq("org_id", orgId);

  if (shipmentError) {
    throw new Error(`Fetch shipments: ${shipmentError.message}`);
  }

  const rows = buildWzMatchRows(orgId, (invoices ?? []) as InvoiceRow[], (shipments ?? []) as ShipmentRow[]);

  const { error: deleteError } = await serviceClient
    .from("wz_matches")
    .delete()
    .eq("org_id", orgId);

  if (deleteError) {
    throw new Error(`Delete wz_matches: ${deleteError.message}`);
  }

  if (rows.length === 0) return;

  for (let index = 0; index < rows.length; index += 500) {
    const batch = rows.slice(index, index + 500);
    const { error: insertError } = await serviceClient.from("wz_matches").insert(batch);

    if (insertError) {
      throw new Error(`Insert wz_matches: ${insertError.message}`);
    }
  }
}
