"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarDays, Download, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import type { ImportActionResult } from "@/app/actions/import-helpers";
import { Dropzone } from "@/components/upload/dropzone";
import { ColumnMappingModal } from "./column-mapping-modal";

interface Props {
  action: (formData: FormData) => Promise<ImportActionResult>;
  orgId: string;
  orgSlug: string;
  fileLabel: string;
  fileDescription: string;
  fileType: "impuls" | "gls" | "customers";
  fieldLabels: Record<string, string>;
  requirePeriod?: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const MONTHS = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

export function ImportButton({
  action,
  orgId,
  orgSlug,
  fileLabel,
  fileDescription,
  fileType,
  fieldLabels,
  requirePeriod = false,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string; warnings?: string[] } | null>(null);
  const [mappingState, setMappingState] = useState<{
    headers: string[];
    unmapped: string[];
    mapping: Record<string, string>;
  } | null>(null);

  function submitImport(explicitMapping?: Record<string, string>) {
    if (!file) return;

    const formData = new FormData();
    formData.append("orgId", orgId);
    formData.append("orgSlug", orgSlug);
    formData.append("file", file);
    if (requirePeriod) {
      formData.append("periodMonth", String(month));
      formData.append("periodYear", String(year));
    }
    if (explicitMapping) {
      formData.append("mapping", JSON.stringify(explicitMapping));
    }

    startTransition(async () => {
      const response = await action(formData);

      if (response.success) {
        setResult({
          type: "success",
          message: `Zaimportowano ${response.importedCount} rekordów.`,
          warnings: response.warnings,
        });
        setMappingState(null);
        setFile(null);
        return;
      }

      if ("requiresMapping" in response && response.requiresMapping) {
        setMappingState({
          headers: response.headers,
          unmapped: response.unmapped,
          mapping: response.mapping,
        });
        return;
      }

      if ("error" in response) {
        setResult({ type: "error", message: response.error });
      }
    });
  }

  return (
    <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6">
      {requirePeriod && (
        <div className="grid gap-4 md:grid-cols-[1fr,140px]">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Miesiąc</label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <select
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {MONTHS.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Rok</label>
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <Dropzone
        label={fileLabel}
        description={fileDescription}
        icon={FileSpreadsheet}
        file={file}
        onFileChange={setFile}
        accept=".xlsx,.xls,.csv"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!file || isPending}
          onClick={() => {
            setResult(null);
            submitImport();
          }}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Importowanie..." : "Importuj plik"}
        </button>
        <Link
          href={`/api/templates/${fileType}`}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Pobierz szablon
        </Link>
      </div>

      {result && (
        <div
          className={`flex gap-3 rounded-lg border p-4 ${
            result.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {result.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium">{result.message}</p>
            {result.warnings?.length ? (
              <ul className="mt-2 space-y-1 text-sm text-yellow-700">
                {result.warnings.map((warning) => (
                  <li key={warning}>⚠ {warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}

      {mappingState ? (
        <ColumnMappingModal
          headers={mappingState.headers}
          unmapped={mappingState.unmapped}
          initialMapping={mappingState.mapping}
          labels={fieldLabels}
          onClose={() => setMappingState(null)}
          onConfirm={(mapping) => {
            setMappingState(null);
            submitImport(mapping);
          }}
        />
      ) : null}
    </div>
  );
}
