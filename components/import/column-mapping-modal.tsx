"use client";

import { useState } from "react";

interface Props {
  headers: string[];
  unmapped: string[];
  initialMapping: Record<string, string>;
  labels: Record<string, string>;
  onClose: () => void;
  onConfirm: (mapping: Record<string, string>) => void;
}

export function ColumnMappingModal({
  headers,
  unmapped,
  initialMapping,
  labels,
  onClose,
  onConfirm,
}: Props) {
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Dopasuj brakujące kolumny</h2>
          <p className="mt-1 text-sm text-gray-500">
            Wybierz nagłówki z pliku dla wymaganych pól, których nie udało się rozpoznać automatycznie.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {unmapped.map((field) => (
            <div key={field} className="grid gap-2 md:grid-cols-[180px,1fr] md:items-center">
              <label className="text-sm font-medium text-gray-700">
                {labels[field] ?? field}
              </label>
              <select
                value={mapping[field] ?? ""}
                onChange={(event) =>
                  setMapping((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Wybierz kolumnę…</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={() => onConfirm(mapping)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Zapisz mapowanie i importuj
          </button>
        </div>
      </div>
    </div>
  );
}
