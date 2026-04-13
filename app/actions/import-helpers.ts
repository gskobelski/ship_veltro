import * as XLSX from "xlsx";
import { createServerClient, createServiceClient } from "../../lib/supabase/server";
import type { FileType } from "../../lib/parsers/column-detector";

export type ImportActionResult =
  | { success: true; importedCount: number; warnings: string[] }
  | { success: false; error: string }
  | {
      success: false;
      requiresMapping: true;
      headers: string[];
      unmapped: string[];
      mapping: Record<string, string>;
    };

const PARSER_MAPPING_KEYS: Record<FileType, Record<string, string>> = {
  impuls: {
    invoice_number: "invoiceNumber",
    invoice_date: "invoiceDate",
    customer_code: "customerCode",
    customer_name: "customerName",
    net_value: "netValue",
    wz_numbers: "wzNumbers",
    product_code: "productCode",
    product_name: "productName",
    quantity: "quantity",
    unit: "unit",
    gross_value: "grossValue",
    vat_value: "vatValue",
    nip: "nip",
  },
  gls: {
    wz_number: "wzNumber",
    shipping_cost: "shippingCost",
    shipment_number: "shipmentNumber",
    customer_code: "customerCode",
    shipment_date: "date",
    carrier_name: "carrierName",
    carrier_invoice_number: "carrierInvoiceNumber",
  },
  customers: {
    customer_code: "customerCode",
    customer_name: "customerName",
    nip: "nip",
    address: "address",
    city: "city",
    postal_code: "postalCode",
    region: "region",
    trade_rep: "tradeRep",
    payment_days: "paymentDays",
    credit_limit: "creditLimit",
  },
};

export async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function assertOrgAccess(orgId: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Brak autoryzacji.");
  }

  const { data: member } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!member) {
    throw new Error("Brak dostępu do tej organizacji.");
  }

  return { supabase, user };
}

export async function upsertMonthlyUpload(
  orgId: string,
  periodMonth: number,
  periodYear: number,
  userId: string
) {
  const serviceClient = await createServiceClient();
  const { data: existing } = await serviceClient
    .from("monthly_uploads")
    .select("id")
    .eq("org_id", orgId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear)
    .maybeSingle();

  const { data: upload, error } = await serviceClient
    .from("monthly_uploads")
    .upsert(
      {
        id: existing?.id,
        org_id: orgId,
        period_month: periodMonth,
        period_year: periodYear,
        status: "processing",
        created_by: userId,
      },
      { onConflict: "org_id,period_month,period_year" }
    )
    .select("id")
    .single();

  if (error || !upload) {
    throw new Error(`Błąd tworzenia wpisu uploadu: ${error?.message ?? "unknown error"}`);
  }

  return { serviceClient, uploadId: upload.id };
}

export async function replaceUploadTableRows(
  table: "invoices" | "shipments",
  uploadId: string,
  records: Record<string, unknown>[]
) {
  const serviceClient = await createServiceClient();

  const { error: deleteError } = await serviceClient
    .from(table)
    .delete()
    .eq("upload_id", uploadId);

  if (deleteError) {
    throw new Error(`Delete ${table}: ${deleteError.message}`);
  }

  if (records.length === 0) return;

  for (let index = 0; index < records.length; index += 500) {
    const batch = records.slice(index, index + 500);
    const { error: insertError } = await serviceClient.from(table).insert(batch);
    if (insertError) {
      throw new Error(`Insert ${table}: ${insertError.message}`);
    }
  }
}

export async function upsertCustomers(records: Record<string, unknown>[]) {
  if (records.length === 0) return;

  const serviceClient = await createServiceClient();

  for (let index = 0; index < records.length; index += 500) {
    const batch = records.slice(index, index + 500);
    const { error } = await serviceClient
      .from("customers")
      .upsert(batch, { onConflict: "org_id,customer_code" });

    if (error) {
      throw new Error(`Upsert customers: ${error.message}`);
    }
  }
}

export async function updateUploadCounts(
  uploadId: string,
  updates: Record<string, unknown>
) {
  const serviceClient = await createServiceClient();
  const { error } = await serviceClient
    .from("monthly_uploads")
    .update({
      ...updates,
      status: "completed",
      processed_at: new Date().toISOString(),
    })
    .eq("id", uploadId);

  if (error) {
    throw new Error(`Update monthly upload: ${error.message}`);
  }
}

export function extractHeaders(fileBuffer: Buffer, fileType: FileType): string[] {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  }) as unknown[][];

  if (raw.length === 0) return [];

  let headerRowIndex = 0;

  for (let index = 0; index < Math.min(10, raw.length); index += 1) {
    const joined = raw[index].map((cell) => String(cell ?? "").toLowerCase()).join(" ");

    if (
      (fileType === "impuls" && (joined.includes("faktura") || joined.includes("invoice"))) ||
      (fileType === "gls" &&
        (joined.includes("przesyłki") ||
          joined.includes("przesylki") ||
          joined.includes("parcel") ||
          joined.includes("shipment"))) ||
      (fileType === "customers" && joined.includes("kod") && (joined.includes("nazwa") || joined.includes("klient")))
    ) {
      headerRowIndex = index;
      break;
    }
  }

  return (raw[headerRowIndex] ?? []).map((value) => String(value ?? ""));
}

export function toParserMapping(
  fileType: FileType,
  mapping: Record<string, string>
): Record<string, string> {
  const keyMap = PARSER_MAPPING_KEYS[fileType];

  return Object.fromEntries(
    Object.entries(mapping)
      .map(([key, value]) => [keyMap[key] ?? key, value])
      .filter(([, value]) => Boolean(value))
  );
}
