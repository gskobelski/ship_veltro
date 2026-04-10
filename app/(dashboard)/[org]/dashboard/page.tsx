import { createServerClient } from "@/lib/supabase/server";
import { UploadHistoryTable } from "@/components/dashboard/upload-history-table";

interface Props {
  params: { org: string };
}

export default async function DashboardPage({ params }: Props) {
  const supabase = await createServerClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", params.org)
    .single();

  const { data: uploads } = await supabase
    .from("monthly_uploads")
    .select("*")
    .eq("org_id", org?.id)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(12);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Przegląd przesłanych danych i raportów
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Przesłane pakiety danych" value={uploads?.length ?? 0} />
        <StatCard label="Ostatni miesiąc" value={getLastPeriod(uploads)} />
        <StatCard label="Status" value="Aktywny" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Historia przesłań</h2>
        <UploadHistoryTable uploads={uploads ?? []} orgSlug={params.org} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function getLastPeriod(uploads: Array<{ period_month: number; period_year: number }> | null) {
  if (!uploads?.length) return "—";
  const last = uploads[0];
  return `${String(last.period_month).padStart(2, "0")}/${last.period_year}`;
}
