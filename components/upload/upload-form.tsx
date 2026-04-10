"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadFilesAction } from "@/app/actions/upload";
import { Dropzone } from "./dropzone";
import { Users, FileText, Truck, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  orgId: string;
  orgSlug: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const MONTHS = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

export function UploadForm({ orgId, orgSlug }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [customersFile, setCustomersFile] = useState<File | null>(null);
  const [impulsFile, setImpulsFile] = useState<File | null>(null);
  const [glsFile, setGlsFile] = useState<File | null>(null);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
    warnings?: string[];
  } | null>(null);

  const canSubmit = customersFile && impulsFile && glsFile && !isPending;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setResult(null);

    const formData = new FormData();
    formData.append("orgId", orgId);
    formData.append("orgSlug", orgSlug);
    formData.append("periodMonth", String(month));
    formData.append("periodYear", String(year));
    formData.append("customersFile", customersFile);
    formData.append("impulsFile", impulsFile);
    formData.append("glsFile", glsFile);

    startTransition(async () => {
      const res = await uploadFilesAction(formData);
      if (res.success) {
        setResult({
          type: "success",
          message: `Dane za ${String(month).padStart(2, "0")}/${year} zostały przetworzone.`,
          warnings: res.warnings,
        });
        // Reset files after success
        setCustomersFile(null);
        setImpulsFile(null);
        setGlsFile(null);
        router.refresh();
      } else {
        setResult({ type: "error", message: res.error });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">
      {/* Period selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Okres rozliczeniowy
        </h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Miesiąc
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MONTHS.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rok
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* File dropzones */}
      <div className="grid gap-4">
        <Dropzone
          label="Baza Klientów"
          description="Plik z listą klientów (kod, nazwa, NIP, adres)"
          icon={Users}
          file={customersFile}
          onFileChange={setCustomersFile}
          accept=".xlsx,.xls,.csv"
        />
        <Dropzone
          label="IMPULS — Faktury"
          description="Export faktur z systemu IMPULS ERP"
          icon={FileText}
          file={impulsFile}
          onFileChange={setImpulsFile}
          accept=".xlsx,.xls,.csv"
        />
        <Dropzone
          label="GLS — Przesyłki"
          description="Raport przesyłek z systemu GLS"
          icon={Truck}
          file={glsFile}
          onFileChange={setGlsFile}
          accept=".xlsx,.xls,.csv"
        />
      </div>

      {/* Status / errors */}
      {result && (
        <div
          className={`flex gap-3 p-4 rounded-lg border ${
            result.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {result.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <p className="text-sm font-medium">{result.message}</p>
            {result.warnings && result.warnings.length > 0 && (
              <ul className="mt-2 text-sm space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-yellow-700">⚠ {w}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isPending
          ? "Przetwarzanie plików..."
          : `Przetwórz dane za ${String(month).padStart(2, "0")}/${year}`}
      </button>
    </form>
  );
}
