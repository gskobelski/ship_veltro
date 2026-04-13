type CustomerRow = {
  id: string;
  customer_code: string;
  customer_name: string;
  nip: string | null;
};

interface Props {
  customers: CustomerRow[];
}

export function CustomersTable({ customers }: Props) {
  if (customers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-500">
        Brak klientów w bazie.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <th className="px-4 py-3 font-medium">ID płatnika</th>
            <th className="px-4 py-3 font-medium">Nazwa klienta</th>
            <th className="px-4 py-3 font-medium">NIP</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id} className="border-b border-gray-100 last:border-b-0">
              <td className="px-4 py-3 font-medium text-gray-900">{customer.customer_code}</td>
              <td className="px-4 py-3 text-gray-700">{customer.customer_name}</td>
              <td className="px-4 py-3 text-gray-500">{customer.nip ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
