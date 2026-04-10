import Link from "next/link";
import type { MonthlyUpload } from "@/types";

interface UploadWithCounts extends MonthlyUpload {
  customers_row_count?: number | null;
  invoices_row_count?: number | null;
  shipments_row_count?: number | null;
}
import { cn } from "@/lib/utils";

const MONTHS = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

const STATUS_LABELS: Record<MonthlyUpload["status"], string> = {
  pending: "Oczekuje",
  processing: "Przetwarzanie",
  completed: "Gotowe",
  error: "Błąd",
};

const STATUS_CLASSES: Record<MonthlyUpload["status"], string> = {
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

interface Props {
  uploads: UploadWithCounts[];
  orgSlug: string;
}

export function UploadHistoryTable({ uploads, orgSlug }: Props) {
  if (uploads.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-sm">Brak przesłanych danych.</p>
        <Link
          href={`/${orgSlug}/upload`}
          className="mt-2 inline-block text-blue-600 text-sm hover:underline"
        >
          Prześlij pierwsze dane →
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 text-gray-500 font-medium">Okres</th>
            <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
            <th className="text-right py-3 px-4 text-gray-500 font-medium">Klienci</th>
            <th className="text-right py-3 px-4 text-gray-500 font-medium">Faktury</th>
            <th className="text-right py-3 px-4 text-gray-500 font-medium">Przesyłki</th>
            <th className="text-left py-3 px-4 text-gray-500 font-medium">Data przesłania</th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((upload) => (
            <tr key={upload.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-3 px-4 font-medium text-gray-900">
                {MONTHS[upload.period_month - 1]} {upload.period_year}
              </td>
              <td className="py-3 px-4">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-medium",
                    STATUS_CLASSES[upload.status]
                  )}
                >
                  {STATUS_LABELS[upload.status]}
                </span>
                {upload.error_message && (
                  <p className="text-xs text-red-500 mt-1 max-w-xs truncate">
                    {upload.error_message}
                  </p>
                )}
              </td>
              <td className="py-3 px-4 text-right text-gray-600">
                {upload.customers_row_count ?? "—"}
              </td>
              <td className="py-3 px-4 text-right text-gray-600">
                {upload.invoices_row_count ?? "—"}
              </td>
              <td className="py-3 px-4 text-right text-gray-600">
                {upload.shipments_row_count ?? "—"}
              </td>
              <td className="py-3 px-4 text-gray-500">
                {new Intl.DateTimeFormat("pl-PL", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(upload.created_at))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
