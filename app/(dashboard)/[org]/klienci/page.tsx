import { importCustomersAction } from "@/app/actions/import-customers";
import { ImportButton } from "@/components/import/import-button";
import { CustomersTable } from "@/components/customers/customers-table";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const FIELD_LABELS = {
  customer_code: "ID płatnika",
  customer_name: "Pełna nazwa klienta",
  nip: "NIP",
};

interface Props {
  params: { org: string };
}

export default async function KlienciPage({ params }: Props) {
  const supabase = await createServerClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", params.org)
    .single();

  if (!org) redirect("/login");

  const { data: customers } = await supabase
    .from("customers")
    .select("id, customer_code, customer_name, nip")
    .eq("org_id", org.id)
    .order("customer_name", { ascending: true })
    .limit(200);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Baza klientów</h1>
        <p className="mt-1 text-gray-500">
          Utrzymuj listę klientów na poziomie organizacji i zapisuj mapowanie kolumn dla kolejnych importów.
        </p>
      </div>
      <ImportButton
        action={importCustomersAction}
        orgId={org.id}
        orgSlug={params.org}
        fileLabel="Plik klientów"
        fileDescription="Lista klientów z kodem, nazwą i NIP-em."
        fileType="customers"
        fieldLabels={FIELD_LABELS}
      />
      <div className="mt-8">
        <CustomersTable customers={(customers ?? []) as Array<{ id: string; customer_code: string; customer_name: string; nip: string | null }>} />
      </div>
    </div>
  );
}
