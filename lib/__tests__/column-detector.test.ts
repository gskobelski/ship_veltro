import { describe, it, expect } from "vitest";
import { detectColumns, REQUIRED_FIELDS } from "../parsers/column-detector";

describe("detectColumns — impuls", () => {
  it("detects standard IMPULS headers", () => {
    const headers = ["Pełny numer faktury", "Data sprzedaży", "Kod płatnika", "Wartość netto", "NIP", "[Nr WZ]"];
    const { mapped, unmapped } = detectColumns("impuls", headers, {});
    expect(mapped.invoice_number).toBe("Pełny numer faktury");
    expect(mapped.invoice_date).toBe("Data sprzedaży");
    expect(mapped.customer_code).toBe("Kod płatnika");
    expect(mapped.net_value).toBe("Wartość netto");
    expect(mapped.wz_numbers).toBe("[Nr WZ]");
    expect(unmapped).toHaveLength(0);
  });

  it("reports unmapped required fields", () => {
    const headers = ["Kolumna A", "Kolumna B"];
    const { unmapped } = detectColumns("impuls", headers, {});
    expect(unmapped).toContain("invoice_number");
    expect(unmapped).toContain("invoice_date");
  });

  it("uses saved mapping to fill gaps", () => {
    const headers = ["MojaNazwaFaktury", "Data sprzedaży", "Kod płatnika", "Wartość netto"];
    const saved = { invoice_number: "MojaNazwaFaktury" };
    const { mapped, unmapped } = detectColumns("impuls", headers, saved);
    expect(mapped.invoice_number).toBe("MojaNazwaFaktury");
    expect(unmapped).not.toContain("invoice_number");
  });
});

describe("detectColumns — gls", () => {
  it("detects standard GLS headers", () => {
    const headers = ["Nr WZ", "Koszt netto", "Nr przesyłki", "Nr klienta", "Data wysyłki", "Nazwa kuriera", "Numer faktury kuriera"];
    const { mapped, unmapped } = detectColumns("gls", headers, {});
    expect(mapped.wz_numbers).toBe("Nr WZ");
    expect(mapped.shipping_cost).toBe("Koszt netto");
    expect(mapped.shipment_number).toBe("Nr przesyłki");
    expect(mapped.carrier_name).toBe("Nazwa kuriera");
    expect(mapped.carrier_invoice_number).toBe("Numer faktury kuriera");
    expect(unmapped).toHaveLength(0);
  });
});

describe("detectColumns — customers", () => {
  it("detects standard customer headers", () => {
    const headers = ["Kod klienta", "Nazwa klienta", "NIP"];
    const { mapped, unmapped } = detectColumns("customers", headers, {});
    expect(mapped.customer_code).toBe("Kod klienta");
    expect(mapped.customer_name).toBe("Nazwa klienta");
    expect(mapped.nip).toBe("NIP");
    expect(unmapped).toHaveLength(0);
  });
});
