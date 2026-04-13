import { describe, expect, it } from "vitest";
import { buildWzMatchRows } from "../../app/actions/rebuild-matches";

const ORG_ID = "org-1";

describe("buildWzMatchRows", () => {
  it("pairs invoice and shipment on the same WZ", () => {
    const invoices = [
      {
        id: "inv-1",
        invoice_number: "FV001",
        invoice_date: "2026-04-01",
        customer_code: "KL001",
        customer_name: "Firma A",
        net_value: 1000,
        wz_numbers: ["WZ000100"],
      },
    ];

    const shipments = [
      {
        id: "ship-1",
        shipment_number: "SHP-1",
        wz_number: "WZ000100",
        shipping_cost: 25,
        parcels_count: 1,
        carrier_name: "GLS",
        carrier_invoice_number: "FGLS001",
      },
    ];

    const rows = buildWzMatchRows(ORG_ID, invoices, shipments);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      org_id: ORG_ID,
      wz_number: "WZ000100",
      invoice_id: "inv-1",
      shipment_id: "ship-1",
      invoice_number: "FV001",
      net_value: 1000,
      shipping_cost: 25,
      carrier_name: "GLS",
      carrier_invoice_number: "FGLS001",
    });
  });

  it("creates row with null shipment when WZ has no matching shipment", () => {
    const rows = buildWzMatchRows(
      ORG_ID,
      [
        {
          id: "inv-1",
          invoice_number: "FV001",
          invoice_date: "2026-04-01",
          customer_code: "KL001",
          customer_name: "Firma A",
          net_value: 500,
          wz_numbers: ["WZ000200"],
        },
      ],
      []
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].shipment_id).toBeNull();
    expect(rows[0].shipping_cost).toBe(0);
  });

  it("creates row with null invoice when WZ has no matching invoice", () => {
    const rows = buildWzMatchRows(ORG_ID, [], [
      {
        id: "ship-1",
        shipment_number: "SHP-1",
        wz_number: "WZ000300",
        shipping_cost: 10,
        parcels_count: 1,
        carrier_name: "GLS",
        carrier_invoice_number: null,
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].invoice_id).toBeNull();
    expect(rows[0].net_value).toBe(0);
  });

  it("creates one row per WZ from the invoice side", () => {
    const rows = buildWzMatchRows(
      ORG_ID,
      [
        {
          id: "inv-1",
          invoice_number: "FV002",
          invoice_date: "2026-04-05",
          customer_code: "KL001",
          customer_name: "Firma A",
          net_value: 2000,
          wz_numbers: ["WZ000400", "WZ000401"],
        },
      ],
      []
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.wz_number).sort()).toEqual(["WZ000400", "WZ000401"]);
    expect(rows.map((row) => row.net_value)).toEqual([1000, 1000]);
  });

  it("splits shipment cost equally across WZ values sharing one shipment number", () => {
    const rows = buildWzMatchRows(ORG_ID, [], [
      {
        id: "ship-1",
        shipment_number: "SHP-2",
        wz_number: "WZ000500",
        shipping_cost: 20,
        parcels_count: 2,
        carrier_name: "GLS",
        carrier_invoice_number: "FGLS002",
      },
      {
        id: "ship-2",
        shipment_number: "SHP-2",
        wz_number: "WZ000501",
        shipping_cost: 20,
        parcels_count: 2,
        carrier_name: "GLS",
        carrier_invoice_number: "FGLS002",
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].shipping_cost).toBe(10);
    expect(rows[1].shipping_cost).toBe(10);
    expect(rows[0].parcels_count).toBe(1);
    expect(rows[1].parcels_count).toBe(1);
  });
});
