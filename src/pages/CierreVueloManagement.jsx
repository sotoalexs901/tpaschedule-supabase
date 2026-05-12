import { useEffect, useState } from "react";

export default function CierreVueloManagement() {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const data =
      JSON.parse(localStorage.getItem("cierreVuelos")) || [];

    setRecords(data);
  };

  const closeMonth = () => {
    const updated = records.map((r) => ({
      ...r,
      closed: true,
    }));

    localStorage.setItem(
      "cierreVuelos",
      JSON.stringify(updated)
    );

    setRecords(updated);

    alert("Mes cerrado");
  };

  const reopenMonth = () => {
    const updated = records.map((r) => ({
      ...r,
      closed: false,
    }));

    localStorage.setItem(
      "cierreVuelos",
      JSON.stringify(updated)
    );

    setRecords(updated);

    alert("Mes reabierto");
  };

  const exportCSV = () => {
    const headers = [
      "Fecha",
      "Airline",
      "Vuelo",
      "Pasajeros",
      "Comentarios",
      "Closed",
    ];

    const rows = records.map((r) => [
      r.fecha,
      r.airline,
      r.vuelo,
      r.pasajeros,
      r.comentarios,
      r.closed ? "YES" : "NO",
    ]);

    const csvContent =
      [headers, ...rows]
        .map((e) => e.join(","))
        .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = "cierre_vuelo.csv";
    link.click();
  };

  const printReport = () => {
    window.print();
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          Cierre de Vuelo Management
        </h1>

        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Export
          </button>

          <button
            onClick={printReport}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg"
          >
            Print
          </button>

          <button
            onClick={closeMonth}
            className="bg-red-600 text-white px-4 py-2 rounded-lg"
          >
            Close Month
          </button>

          <button
            onClick={reopenMonth}
            className="bg-green-600 text-white px-4 py-2 rounded-lg"
          >
            Reopen
          </button>
        </div>
      </div>

      <div className="overflow-auto bg-white rounded-xl shadow">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">Fecha</th>
              <th className="p-3 text-left">Airline</th>
              <th className="p-3 text-left">Vuelo</th>
              <th className="p-3 text-left">Pasajeros</th>
              <th className="p-3 text-left">Comentarios</th>
              <th className="p-3 text-left">Closed</th>
            </tr>
          </thead>

          <tbody>
            {records.map((record, index) => (
              <tr
                key={index}
                className="border-t"
              >
                <td className="p-3">
                  {record.fecha}
                </td>

                <td className="p-3">
                  {record.airline}
                </td>

                <td className="p-3">
                  {record.vuelo}
                </td>

                <td className="p-3">
                  {record.pasajeros}
                </td>

                <td className="p-3">
                  {record.comentarios}
                </td>

                <td className="p-3">
                  {record.closed ? "YES" : "NO"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
