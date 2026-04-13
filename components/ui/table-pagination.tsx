import Link from "next/link";

interface Props {
  page: number;
  total: number;
  pageSize: number;
  basePath: string;
}

export function TablePagination({ page, total, pageSize, basePath }: Props) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between text-sm text-gray-500">
      <span>
        Strona {page + 1} z {totalPages} ({total} rekordów)
      </span>
      <div className="flex gap-2">
        {page > 0 && (
          <Link
            href={`${basePath}?page=${page - 1}`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
          >
            Poprzednia
          </Link>
        )}
        {page + 1 < totalPages && (
          <Link
            href={`${basePath}?page=${page + 1}`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
          >
            Następna
          </Link>
        )}
      </div>
    </div>
  );
}
