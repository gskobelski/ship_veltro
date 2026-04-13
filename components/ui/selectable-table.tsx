"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

interface Row {
  id: string;
  cells: React.ReactNode[];
}

interface Props {
  headers: string[];
  rows: Row[];
  onDeleteSelected: (ids: string[]) => Promise<void>;
}

export function SelectableTable({ headers, rows, onDeleteSelected }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDelete() {
    const ids = Array.from(selected);
    startTransition(async () => {
      await onDeleteSelected(ids);
      setSelected(new Set());
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-500">
        Brak danych.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {isPending ? "Usuwanie..." : `Usuń zaznaczone (${selected.size})`}
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={isPending}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 accent-blue-600"
                />
              </th>
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-gray-100 last:border-b-0 ${
                  selected.has(row.id) ? "bg-blue-50" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    disabled={isPending}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 accent-blue-600"
                  />
                </td>
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-4 py-3 text-gray-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
