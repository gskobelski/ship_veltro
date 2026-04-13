export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
}

export interface MonthlyUpload {
  id: string;
  org_id: string;
  period_month: number;
  period_year: number;
  status: "pending" | "processing" | "completed" | "error";
  customers_file_path: string | null;
  impuls_file_path: string | null;
  gls_file_path: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

// ---- Parsed data types ----

export interface CustomerRecord {
  id: string;
  org_id: string;
  upload_id: string | null;
  customer_code: string;
  customer_name: string;
  nip: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  region: string | null;
  trade_rep: string | null;
  payment_days: number | null;
  credit_limit: number | null;
  raw_data: Record<string, unknown>;
}

export interface InvoiceRecord {
  id: string;
  org_id: string;
  upload_id: string;
  invoice_number: string;
  invoice_date: string;
  customer_code: string;
  customer_name: string | null;
  net_value: number;
  gross_value: number;
  vat_value: number;
  product_code: string | null;
  product_name: string | null;
  quantity: number | null;
  unit: string | null;
  wz_numbers: string[];
  raw_data: Record<string, unknown>;
}

export interface ComplaintRecord {
  id: string;
  org_id: string;
  upload_id: string;
  customer_code: string;
  invoice_number: string | null;
  shipment_number: string | null;
  return_date: string | null;
  reason: string | null;
  gross_value: number | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  raw_data: Record<string, unknown>;
}

export interface ShipmentRecord {
  id: string;
  org_id: string;
  upload_id: string;
  shipment_number: string;
  shipment_date: string;
  customer_code: string | null;
  receiver_name: string;
  receiver_city: string | null;
  receiver_postal_code: string | null;
  weight_kg: number | null;
  parcels_count: number;
  cod_amount: number | null;
  declared_value: number | null;
  shipping_cost: number | null;
  service_type: string | null;
  status: string | null;
  reference1: string | null;
  reference2: string | null;
  wz_numbers: string[];
  carrier_name: string | null;
  carrier_invoice_number: string | null;
  raw_data: Record<string, unknown>;
}

// ---- Parser result types ----

export interface ParseResult<T> {
  records: T[];
  errors: string[];
  warnings: string[];
  rowCount: number;
}

// ---- WZ Matching ----

export interface WzMatch {
  id: string;
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
  created_at: string;
}

export interface ColumnMapping {
  id: string;
  org_id: string;
  file_type: "impuls" | "gls" | "customers";
  mapping: Record<string, string>; // { internalField: "fileColumnHeader" }
  updated_at: string;
}

// ---- Report row types (computed from wz_matches) ----

export interface ReportByInvoice {
  invoice_number: string;
  customer_code: string | null;
  customer_name: string | null;
  invoice_date: string | null;
  wartosc_fv: number;
  koszt_transportu: number;
  liczba_paczek: number;
  nr_wz: string; // comma-separated
}

export interface ReportByClient {
  customer_code: string | null;
  customer_name: string | null;
  wartosc_faktur: number;
  koszt_transportu: number;
  liczba_paczek: number;
}

export interface ReportByShipment {
  shipment_number: string | null;
  nr_faktur: string; // comma-separated
  customer_name: string | null;
  wartosc_fv: number;
  koszt_paczki: number;
  carrier_invoice_number: string | null;
}
