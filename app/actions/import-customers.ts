"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadColumnMapping, saveColumnMapping } from "./column-mapping";
import {
  assertOrgAccess,
  extractHeaders,
  fileToBuffer,
  toParserMapping,
  type ImportActionResult,
  upsertCustomers,
} from "./import-helpers";
import { detectColumns } from "../../lib/parsers/column-detector";
import { parseCustomersFile } from "../../lib/parsers/customers";

const ImportCustomersSchema = z.object({
  orgId: z.string().uuid(),
  orgSlug: z.string().min(1),
});

function parseMapping(raw: FormDataEntryValue | null): Record<string, string> {
  if (typeof raw !== "string" || raw.trim() === "") return {};

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

export async function importCustomersAction(formData: FormData): Promise<ImportActionResult> {
  const parsed = ImportCustomersSchema.safeParse({
    orgId: formData.get("orgId"),
    orgSlug: formData.get("orgSlug"),
  });

  if (!parsed.success) {
    return { success: false, error: "Nieprawidłowe dane formularza." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Plik bazy klientów jest wymagany." };
  }

  const { orgId, orgSlug } = parsed.data;

  try {
    await assertOrgAccess(orgId);
    const fileBuffer = await fileToBuffer(file);
    const headers = extractHeaders(fileBuffer, "customers");
    const savedMapping = await loadColumnMapping(orgId, "customers");
    const explicitMapping = parseMapping(formData.get("mapping"));
    const detected = detectColumns("customers", headers, { ...savedMapping, ...explicitMapping });

    if (detected.unmapped.length > 0) {
      return {
        success: false,
        requiresMapping: true,
        headers,
        unmapped: detected.unmapped,
        mapping: detected.mapped,
      };
    }

    const parserResult = parseCustomersFile(
      fileBuffer,
      null,
      orgId,
      toParserMapping("customers", detected.mapped)
    );

    if (parserResult.errors.length > 0) {
      return { success: false, error: parserResult.errors.join("\n") };
    }

    await upsertCustomers(parserResult.records as unknown as Record<string, unknown>[]);
    await saveColumnMapping(orgId, "customers", detected.mapped);

    revalidatePath(`/${orgSlug}/klienci`);

    return {
      success: true,
      importedCount: parserResult.records.length,
      warnings: parserResult.warnings,
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
