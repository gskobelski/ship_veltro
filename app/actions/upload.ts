"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { parseCustomersFile } from "@/lib/parsers/customers";
import { parseImpulsFile } from "@/lib/parsers/impuls";
import { parseGlsFile } from "@/lib/parsers/gls";
import { z } from "zod";

const UploadSchema = z.object({
  orgId: z.string().uuid(),
  orgSlug: z.string().min(1),
  periodMonth: z.coerce.number().min(1).max(12),
  periodYear: z.coerce.number().min(2020).max(2100),
});

export type UploadActionResult =
  | { success: true; uploadId: string; warnings: string[] }
  | { success: false; error: string };

export async function uploadFilesAction(
  formData: FormData
): Promise<UploadActionResult> {
  // 1. Validate form inputs
  const parsed = UploadSchema.safeParse({
    orgId: formData.get("orgId"),
    orgSlug: formData.get("orgSlug"),
    periodMonth: formData.get("periodMonth"),
    periodYear: formData.get("periodYear"),
  });

  if (!parsed.success) {
    return { success: false, error: "Nieprawidłowe dane formularza." };
  }

  const { orgId, orgSlug, periodMonth, periodYear } = parsed.data;

  // 2. Auth check
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Brak autoryzacji." };

  // 3. Check membership (multi-tenant guard)
  const { data: member } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!member) return { success: false, error: "Brak dostępu do tej organizacji." };

  // 4. Check for existing upload for this period
  const { data: existing } = await supabase
    .from("monthly_uploads")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear)
    .single();

  if (existing?.status === "completed") {
    return {
      success: false,
      error: `Dane za ${periodMonth}/${periodYear} zostały już przetworzone. Usuń istniejący wpis, aby ponownie przesłać.`,
    };
  }

  // 5. Read files
  const customersFile = formData.get("customersFile") as File | null;
  const impulsFile = formData.get("impulsFile") as File | null;
  const glsFile = formData.get("glsFile") as File | null;

  if (!customersFile || !impulsFile || !glsFile) {
    return { success: false, error: "Wszystkie 3 pliki są wymagane." };
  }

  const [customersBuffer, impulsBuffer, glsBuffer] = await Promise.all([
    fileToBuffer(customersFile),
    fileToBuffer(impulsFile),
    fileToBuffer(glsFile),
  ]);

  // 6. Create upload record
  const serviceClient = await createServiceClient();

  const { data: upload, error: uploadError } = await serviceClient
    .from("monthly_uploads")
    .upsert(
      {
        id: existing?.id,
        org_id: orgId,
        period_month: periodMonth,
        period_year: periodYear,
        status: "processing",
        created_by: user.id,
      },
      { onConflict: "org_id,period_month,period_year" }
    )
    .select("id")
    .single();

  if (uploadError || !upload) {
    return { success: false, error: `Błąd tworzenia wpisu: ${uploadError?.message}` };
  }

  const uploadId = upload.id;
  const allWarnings: string[] = [];

  try {
    // 7. Parse all three files
    const [customersResult, impulsResult, glsResult] = await Promise.all([
      parseCustomersFile(customersBuffer, uploadId, orgId),
      parseImpulsFile(impulsBuffer, uploadId, orgId),
      parseGlsFile(glsBuffer, uploadId, orgId),
    ]);

    // Collect all parsing errors
    const allErrors = [
      ...customersResult.errors.map((e) => `[Baza Klientów] ${e}`),
      ...impulsResult.errors.map((e) => `[IMPULS] ${e}`),
      ...glsResult.errors.map((e) => `[GLS] ${e}`),
    ];

    allWarnings.push(
      ...customersResult.warnings.map((w) => `[Baza Klientów] ${w}`),
      ...impulsResult.warnings.map((w) => `[IMPULS] ${w}`),
      ...glsResult.warnings.map((w) => `[GLS] ${w}`)
    );

    if (allErrors.length > 0) {
      await serviceClient
        .from("monthly_uploads")
        .update({ status: "error", error_message: allErrors.join("; ") })
        .eq("id", uploadId);
      return { success: false, error: allErrors.join("\n") };
    }

    // 8. Save parsed data to DB (in batches of 500)
    const BATCH = 500;

    await Promise.all([
      batchInsert(serviceClient, "customers", customersResult.records, BATCH),
      batchInsert(serviceClient, "invoices", impulsResult.records, BATCH),
      batchInsert(serviceClient, "shipments", glsResult.records, BATCH),
    ]);

    // 9. Mark upload as completed
    await serviceClient
      .from("monthly_uploads")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        customers_row_count: customersResult.records.length,
        invoices_row_count: impulsResult.records.length,
        shipments_row_count: glsResult.records.length,
      })
      .eq("id", uploadId);

    revalidatePath(`/${orgSlug}/dashboard`);
    revalidatePath(`/${orgSlug}/upload`);

    return { success: true, uploadId, warnings: allWarnings };
  } catch (err) {
    await serviceClient
      .from("monthly_uploads")
      .update({ status: "error", error_message: String(err) })
      .eq("id", uploadId);
    return { success: false, error: `Błąd przetwarzania: ${String(err)}` };
  }
}

async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function batchInsert(
  client: Awaited<ReturnType<typeof createServiceClient>>,
  table: string,
  records: Record<string, unknown>[],
  batchSize: number
) {
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await client.from(table).insert(batch);
    if (error) throw new Error(`Insert error (${table}): ${error.message}`);
  }
}
