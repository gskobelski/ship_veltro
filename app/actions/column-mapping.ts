"use server";

import { createServerClient } from "../../lib/supabase/server";
import type { ColumnMapping } from "../../types";

export type ColumnMappingFileType = "impuls" | "gls" | "customers";

async function assertOrgMembership(orgId: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Brak autoryzacji.");
  }

  const { data: member, error } = await supabase
    .from("org_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (error || !member) {
    throw new Error("Brak dostępu do tej organizacji.");
  }

  return supabase;
}

export async function loadColumnMapping(
  orgId: string,
  fileType: ColumnMappingFileType
): Promise<Record<string, string>> {
  const supabase = await assertOrgMembership(orgId);
  const { data, error } = await supabase
    .from("column_mappings")
    .select("mapping")
    .eq("org_id", orgId)
    .eq("file_type", fileType)
    .maybeSingle();

  if (error) {
    throw new Error(`Load column mapping: ${error.message}`);
  }

  return (data?.mapping as Record<string, string> | undefined) ?? {};
}

export async function saveColumnMapping(
  orgId: string,
  fileType: ColumnMappingFileType,
  mapping: Record<string, string>
): Promise<ColumnMapping> {
  const supabase = await assertOrgMembership(orgId);
  const { data, error } = await supabase
    .from("column_mappings")
    .upsert(
      {
        org_id: orgId,
        file_type: fileType,
        mapping,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,file_type" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Save column mapping: ${error?.message ?? "unknown error"}`);
  }

  return data as ColumnMapping;
}
