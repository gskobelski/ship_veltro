import { importCustomersAction } from "@/app/actions/import-customers";
import { ImportButton } from "@/components/import/import-button";
import { CustomersTable } from "@/components/customers/customers-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const FIELD_LABELS = {
  customer_code: "ID płatnika",
  customer_name: "Pełna nazwa klienta",
  nip: "NIP",
};

const PAGE_SIZE = 50;

interface Props {
  params: { org: string };
  searchParams?: { page?: string };
}

export default async function KlienciPage({ params, searchParams }: Props) {
  const supabase = await createServerClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", params.org)
    .single();

  if (!org) redirect("/login");

  const page = Math.max(0, Number(searchParams?.page ?? 0));

  const { data: customers, count } = await supabase
    .from("customers")
    .select("id, customer_code, customer_name, nip", { count: "exact" })
    .eq("org_id", org.id)
    .order("customer_name", { ascending: true })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

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
      <div className="mt-8 space-y-4">
        <CustomersTable
          orgId={org.id}
          customers={(customers ?? []) as Array<{ id: string; customer_code: string; customer_name: string; nip: string | null }>}
        />
        <TablePagination
          page={page}
          total={count ?? 0}
          pageSize={PAGE_SIZE}
          basePath={`/${params.org}/klienci`}
        />
      </div>
    </div>
  );
}
