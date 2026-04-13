"use client";

import { useRouter } from "next/navigation";
import { SelectableTable } from "@/components/ui/selectable-table";
import { deleteCustomersAction } from "@/app/actions/delete-records";

type CustomerRow = {
  id: string;
  customer_code: string;
  customer_name: string;
  nip: string | null;
};

interface Props {
  orgId: string;
  customers: CustomerRow[];
}

export function CustomersTable({ orgId, customers }: Props) {
  const router = useRouter();

  const rows = customers.map((c) => ({
    id: c.id,
    cells: [c.customer_code, c.customer_name, c.nip ?? "—"],
  }));

  return (
    <SelectableTable
      headers={["ID płatnika", "Nazwa klienta", "NIP"]}
      rows={rows}
      onDeleteSelected={async (ids) => {
        await deleteCustomersAction(orgId, ids);
        router.refresh();
      }}
    />
  );
}
