"use client";

import { useRouter } from "next/navigation";
import { SelectableTable } from "@/components/ui/selectable-table";
import { deleteInvoicesAction } from "@/app/actions/delete-records";
import type { InvoiceRecord } from "@/types";

interface Props {
  orgId: string;
  invoices: InvoiceRecord[];
}

export function InvoicesTable({ orgId, invoices }: Props) {
  const router = useRouter();

  const rows = invoices.map((inv) => ({
    id: inv.id,
    cells: [
      inv.invoice_number,
      inv.invoice_date,
      inv.customer_code,
      inv.customer_name ?? "—",
      inv.net_value.toFixed(2),
      inv.wz_numbers?.join(", ") || "—",
    ],
  }));

  return (
    <SelectableTable
      headers={["Nr faktury", "Data", "ID klienta", "Klient", "Wartość netto", "Nr WZ"]}
      rows={rows}
      onDeleteSelected={async (ids) => {
        await deleteInvoicesAction(orgId, ids);
        router.refresh();
      }}
    />
  );
}
