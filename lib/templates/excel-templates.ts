import * as XLSX from "xlsx";
import { z } from "zod";

export const templateTypeSchema = z.enum(["impuls", "gls", "customers"]);
export type TemplateType = z.infer<typeof templateTypeSchema>;

const TEMPLATE_HEADERS: Record<TemplateType, string[]> = {
  impuls: [
    "Numer faktury",
    "Data wystawienia faktury",
    "ID płatnika",
    "NIP",
    "Wartość netto",
    "Nr WZ",
  ],
  gls: [
    "Nr WZ",
    "Koszt netto",
    "Nr przesyłki",
    "Nr klienta",
    "Data wysyłki",
    "Nazwa kuriera",
    "Nr faktury kuriera",
  ],
  customers: [
    "ID płatnika",
    "Pełna nazwa klienta",
    "NIP",
  ],
};

export function getTemplateHeaders(type: TemplateType): string[] {
  return TEMPLATE_HEADERS[type];
}

export function buildTemplateWorkbook(type: TemplateType): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([getTemplateHeaders(type)]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Szablon");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
