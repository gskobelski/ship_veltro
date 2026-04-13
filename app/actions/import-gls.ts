"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadColumnMapping, saveColumnMapping } from "./column-mapping";
import {
  assertOrgAccess,
  extractHeaders,
  fileToBuffer,
  replaceUploadTableRows,
  toParserMapping,
  type ImportActionResult,
  updateUploadCounts,
  upsertMonthlyUpload,
} from "./import-helpers";
import { rebuildWzMatchesAction } from "./rebuild-matches";
import { detectColumns } from "../../lib/parsers/column-detector";
import { parseGlsFile } from "../../lib/parsers/gls";

const ImportGlsSchema = z.object({
  orgId: z.string().uuid(),
  orgSlug: z.string().min(1),
  periodMonth: z.coerce.number().min(1).max(12),
  periodYear: z.coerce.number().min(2020).max(2100),
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

export async function importGlsAction(formData: FormData): Promise<ImportActionResult> {
  const parsed = ImportGlsSchema.safeParse({
    orgId: formData.get("orgId"),
    orgSlug: formData.get("orgSlug"),
    periodMonth: formData.get("periodMonth"),
    periodYear: formData.get("periodYear"),
  });

  if (!parsed.success) {
    return { success: false, error: "Nieprawidłowe dane formularza." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Plik GLS jest wymagany." };
  }

  const { orgId, orgSlug, periodMonth, periodYear } = parsed.data;

  try {
    const { user } = await assertOrgAccess(orgId);
    const fileBuffer = await fileToBuffer(file);
    const headers = extractHeaders(fileBuffer, "gls");
    const savedMapping = await loadColumnMapping(orgId, "gls");
    const explicitMapping = parseMapping(formData.get("mapping"));
    const detected = detectColumns("gls", headers, { ...savedMapping, ...explicitMapping });

    if (detected.unmapped.length > 0) {
      return {
        success: false,
        requiresMapping: true,
        headers,
        unmapped: detected.unmapped,
        mapping: detected.mapped,
      };
    }

    const { uploadId } = await upsertMonthlyUpload(orgId, periodMonth, periodYear, user.id);
    const parserResult = parseGlsFile(
      fileBuffer,
      uploadId,
      orgId,
      toParserMapping("gls", detected.mapped)
    );

    if (parserResult.errors.length > 0) {
      return { success: false, error: parserResult.errors.join("\n") };
    }

    await replaceUploadTableRows(
      "shipments",
      uploadId,
      parserResult.records as unknown as Record<string, unknown>[]
    );
    await saveColumnMapping(orgId, "gls", detected.mapped);
    await rebuildWzMatchesAction(orgId);
    await updateUploadCounts(uploadId, { shipments_row_count: parserResult.records.length });

    revalidatePath(`/${orgSlug}/przesylki`);
    revalidatePath(`/${orgSlug}/zestawienia`);

    return {
      success: true,
      importedCount: parserResult.records.length,
      warnings: parserResult.warnings,
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
