"use client";

import { useRef, useState, useCallback } from "react";
import { type LucideIcon, X, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  description: string;
  icon: LucideIcon;
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
}

export function Dropzone({ label, description, icon: Icon, file, onFileChange, accept }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) onFileChange(dropped);
    },
    [onFileChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) onFileChange(selected);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !file && inputRef.current?.click()}
      className={cn(
        "relative bg-white rounded-xl border-2 transition-colors",
        file
          ? "border-green-300 cursor-default"
          : isDragging
          ? "border-blue-400 bg-blue-50 cursor-copy"
          : "border-dashed border-gray-300 hover:border-blue-400 hover:bg-gray-50 cursor-pointer"
      )}
    >
      <div className="flex items-center gap-4 p-5">
        {/* Icon column */}
        <div
          className={cn(
            "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center",
            file ? "bg-green-100" : "bg-gray-100"
          )}
        >
          {file ? (
            <FileSpreadsheet className="h-6 w-6 text-green-600" />
          ) : (
            <Icon className={cn("h-6 w-6", isDragging ? "text-blue-500" : "text-gray-400")} />
          )}
        </div>

        {/* Text column */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{label}</p>
          {file ? (
            <p className="text-sm text-gray-600 truncate mt-0.5">
              {file.name}{" "}
              <span className="text-gray-400">({formatSize(file.size)})</span>
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-0.5">{description}</p>
          )}
          {!file && (
            <p className="text-xs text-gray-400 mt-1">
              Przeciągnij plik lub kliknij — {accept ?? ".xlsx, .xls, .csv"}
            </p>
          )}
        </div>

        {/* Remove button */}
        {file && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFileChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="flex-shrink-0 p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            aria-label="Usuń plik"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
