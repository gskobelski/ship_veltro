"use server";

import { assertOrgAccess } from "@/app/actions/import-helpers";
import { createServiceClient } from "@/lib/supabase/server";

export async function deleteInvoicesAction(orgId: string, ids: string[]) {
  await assertOrgAccess(orgId);
  const service = await createServiceClient();
  const { error } = await service
    .from("invoices")
    .delete()
    .in("id", ids)
    .eq("org_id", orgId);
  if (error) throw new Error(`Delete invoices: ${error.message}`);
}

export async function deleteShipmentsAction(orgId: string, ids: string[]) {
  await assertOrgAccess(orgId);
  const service = await createServiceClient();
  const { error } = await service
    .from("shipments")
    .delete()
    .in("id", ids)
    .eq("org_id", orgId);
  if (error) throw new Error(`Delete shipments: ${error.message}`);
}

export async function deleteCustomersAction(orgId: string, ids: string[]) {
  await assertOrgAccess(orgId);
  const service = await createServiceClient();
  const { error } = await service
    .from("customers")
    .delete()
    .in("id", ids)
    .eq("org_id", orgId);
  if (error) throw new Error(`Delete customers: ${error.message}`);
}
