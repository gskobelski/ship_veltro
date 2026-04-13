"use client";

import { useRouter } from "next/navigation";
import { SelectableTable } from "@/components/ui/selectable-table";
import { deleteShipmentsAction } from "@/app/actions/delete-records";
import type { ShipmentRecord } from "@/types";

interface Props {
  orgId: string;
  shipments: ShipmentRecord[];
}

export function ShipmentsTable({ orgId, shipments }: Props) {
  const router = useRouter();

  const rows = shipments.map((s) => ({
    id: s.id,
    cells: [
      s.wz_numbers.join(", ") || "—",
      s.shipment_number,
      s.shipment_date,
      s.customer_code ?? "—",
      s.shipping_cost !== null ? s.shipping_cost.toFixed(2) : "—",
      s.carrier_name ?? "—",
    ],
  }));

  return (
    <SelectableTable
      headers={["Nr WZ", "Nr przesyłki", "Data", "ID klienta", "Koszt", "Kurier"]}
      rows={rows}
      onDeleteSelected={async (ids) => {
        await deleteShipmentsAction(orgId, ids);
        router.refresh();
      }}
    />
  );
}
