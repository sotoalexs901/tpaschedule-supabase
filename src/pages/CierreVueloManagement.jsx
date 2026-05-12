import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

const DEFAULT_AIRLINES = [
  "West Jet",
  "Avianca",
  "Sun Country",
  "World Atlantic",
];

function numberValue(value) {
  return Number(value || 0);
}

function formatMoney(value) {
  return `$${numberValue(value).toFixed(2)}`;
}

function getYearMonthOptions() {
  const now = new Date();
  const year = now.getFullYear();

  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return `${year}-${month}`;
  });
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function CierreVueloManagement() {
  const { user } = useUser();

  const [flights, setFlights] = useState([]);
  const [fuelRows, setFuelRows] = useState([]);
  const [closures, setClosures] = useState({});

  const [filters, setFilters] = useState({
    airline: "",
    monthKey: "",
  });

  const airlines = useMemo(() => {
    const fromFlights = flights.map((row) => row.airline).filter(Boolean);
    const fromFuel = fuelRows.map((row) => row.airline).filter(Boolean);

    return Array.from(
      new Set([...DEFAULT_AIRLINES, ...fromFlights, ...fromFuel])
    );
  }, [flights, fuelRows]);

  useEffect(() => {
    const unsubFlights = onSnapshot(
      collection(db, "cierreVueloFlights"),
      (snapshot) => {
        setFlights(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      (error) => console.error("Error loading cierreVueloFlights:", error)
    );

    const unsubFuel = onSnapshot(
      collection(db, "cierreVueloFuel"),
      (snapshot) => {
        setFuelRows(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      (error) => console.error("Error loading cierreVueloFuel:", error)
    );

    const unsubClosures = onSnapshot(
      collection(db, "cierreVueloMonthClosures"),
      (snapshot) => {
        const next = {};

        snapshot.docs.forEach((item) => {
          next[item.id] = {
            id: item.id,
            ...item.data(),
          };
        });

        setClosures(next);
      },
      (error) => console.error("Error loading month closures:", error)
    );

    return () => {
      unsubFlights();
      unsubFuel();
      unsubClosures();
    };
  }, []);

  const filteredFlights = useMemo(() => {
    return flights.filter((row) => {
      if (filters.airline && row.airline !== filters.airline) return false;
      if (filters.monthKey && row.monthKey !== filters.monthKey) return false;
      return true;
    });
  }, [flights, filters]);

  const filteredFuel = useMemo(() => {
    return fuelRows.filter((row) => {
      if (filters.airline && row.airline !== filters.airline) return false;
      if (filters.monthKey && row.monthKey !== filters.monthKey) return false;
      return true;
    });
  }, [fuelRows, filters]);

  const activeClosureKey =
    filters.airline && filters.monthKey
      ? `${filters.airline}_${filters.monthKey}`
      : "";

  const activeClosure = activeClosureKey ? closures[activeClosureKey] : null;

  const isClosed = activeClosure?.status === "CLOSED";

  const monthlyReport = useMemo(() => {
    const totals = filteredFlights.reduce(
      (acc, row) => {
        acc.vuelos += 1;
        acc.pax += numberValue(row.pax);
        acc.bags += numberValue(row.bags);
        acc.cardQty += numberValue(row.totals?.cardQty);
        acc.cardAmount += numberValue(row.totals?.cardAmount);
        acc.cashQty += numberValue(row.totals?.cashQty);
        acc.cashAmount += numberValue(row.totals?.cashAmount);
        acc.ancillaryAmount += numberValue(row.totals?.ancillaryAmount);
        acc.agentSales += numberValue(row.totals?.agentSales);
        acc.agentAmount += numberValue(row.totals?.agentAmount);
        return acc;
      },
      {
        vuelos: 0,
        pax: 0,
        bags: 0,
        cardQty: 0,
        cardAmount: 0,
        cashQty: 0,
        cashAmount: 0,
        ancillaryAmount: 0,
        agentSales: 0,
        agentAmount: 0,
      }
    );

    const fuelGallons = filteredFuel.reduce(
      (sum, row) => sum + numberValue(row.gallons),
      0
    );

    return {
      ...totals,
      fuelGallons,
    };
  }, [filteredFlights, filteredFuel]);

  const agentReport = useMemo(() => {
    const map = new Map();

    filteredFlights.forEach((flight) => {
      (flight.agents || []).forEach((agentRow) => {
        const name = agentRow.agent || "Unknown";

        if (!map.has(name)) {
          map.set(name, {
            agent: name,
            ventas: 0,
            monto: 0,
          });
        }

        const current = map.get(name);
        current.ventas += numberValue(agentRow.ventas);
        current.monto += numberValue(agentRow.monto);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.monto - a.monto);
  }, [filteredFlights]);

  const conceptReport = useMemo(() => {
    const map = new Map();

    filteredFlights.forEach((flight) => {
      [
        ...(flight.cardConcepts || []).map((row) => ({
          ...row,
          type: "CARD",
        })),
        ...(flight.cashConcepts || []).map((row) => ({
          ...row,
          type: "CASH",
        })),
      ].forEach((row) => {
        const key = `${row.type}_${row.concept}`;

        if (!map.has(key)) {
          map.set(key, {
            type: row.type,
            concept: row.concept,
            cantidad: 0,
            monto: 0,
          });
        }

        const current = map.get(key);
        current.cantidad += numberValue(row.cantidad);
        current.monto += numberValue(row.monto);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.monto - a.monto);
  }, [filteredFlights]);

  const annualSummary = useMemo(() => {
    const map = new Map();

    flights.forEach((row) => {
      const month = row.monthKey || "No Month";

      if (!map.has(month)) {
        map.set(month, {
          month,
          vuelos: 0,
          pax: 0,
          bags: 0,
          ancillaries: 0,
          agentSales: 0,
          fuelGallons: 0,
        });
      }

      const current = map.get(month);
      current.vuelos += 1;
      current.pax += numberValue(row.pax);
      current.bags += numberValue(row.bags);
      current.ancillaries += numberValue(row.totals?.ancillaryAmount);
      current.agentSales += numberValue(row.totals?.agentSales);
    });

    fuelRows.forEach((row) => {
      const month = row.monthKey || "No Month";

      if (!map.has(month)) {
        map.set(month, {
          month,
          vuelos: 0,
          pax: 0,
          bags: 0,
          ancillaries: 0,
          agentSales: 0,
          fuelGallons: 0,
        });
      }

      map.get(month).fuelGallons += numberValue(row.gallons);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );
  }, [flights, fuelRows]);

  const closeMonth = async () => {
    if (!filters.airline || !filters.monthKey) {
      alert("Selecciona Airline y Month antes de cerrar el mes.");
      return;
    }

    const id = `${filters.airline}_${filters.monthKey}`;

    await setDoc(
      doc(db, "cierreVueloMonthClosures", id),
      {
        airline: filters.airline,
        monthKey: filters.monthKey,
        status: "CLOSED",
        closedBy: user?.displayName || user?.name || user?.username || "",
        closedById: user?.id || "",
        closedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    alert("Mes cerrado.");
  };

  const reopenMonth = async () => {
    if (!filters.airline || !filters.monthKey) {
      alert("Selecciona Airline y Month antes de reabrir el mes.");
      return;
    }

    const id = `${filters.airline}_${filters.monthKey}`;

    await setDoc(
      doc(db, "cierreVueloMonthClosures", id),
      {
        airline: filters.airline,
        monthKey: filters.monthKey,
        status: "OPEN",
        reopenedBy: user?.displayName || user?.name || user?.username || "",
        reopenedById: user?.id || "",
        reopenedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    alert("Mes reabierto.");
  };

  const editFlight = async (row) => {
    const flightNumber = prompt("Editar vuelo:", row.flightNumber || "");
    if (flightNumber === null) return;

    const pax = prompt("Editar PAX:", String(row.pax ?? ""));
    if (pax === null) return;

    const bags = prompt("Editar maletas:", String(row.bags ?? ""));
    if (bags === null) return;

    const supervisor = prompt("Editar supervisor:", row.supervisor || "");
    if (supervisor === null) return;

    const closingAgent = prompt("Editar agente cierre:", row.closingAgent || "");
    if (closingAgent === null) return;

    await updateDoc(doc(db, "cierreVueloFlights", row.id), {
      flightNumber,
      pax: numberValue(pax),
      bags: numberValue(bags),
      supervisor,
      closingAgent,
      updatedBy: user?.displayName || user?.name || user?.username || "",
      updatedById: user?.id || "",
      updatedAt: serverTimestamp(),
    });

    alert("Registro de vuelo actualizado.");
  };

  const deleteFlight = async (row) => {
    const confirmDelete = window.confirm(
      `¿Seguro que quieres borrar el vuelo ${row.flightNumber || ""}?`
    );

    if (!confirmDelete) return;

    await deleteDoc(doc(db, "cierreVueloFlights", row.id));

    alert("Registro de vuelo borrado.");
  };

  const editFuel = async (row) => {
    const ticketNumber = prompt("Editar No. Ticket:", row.ticketNumber || "");
    if (ticketNumber === null) return;

    const gallons = prompt("Editar gallons:", String(row.gallons ?? ""));
    if (gallons === null) return;

    const agent = prompt("Editar agente:", row.agent || "");
    if (agent === null) return;

    const supervisor = prompt("Editar supervisor:", row.supervisor || "");
    if (supervisor === null) return;

    const flightNumber = prompt("Editar vuelo:", row.flightNumber || "");
    if (flightNumber === null) return;

    const notes = prompt("Editar notas:", row.notes || "");
    if (notes === null) return;

    await updateDoc(doc(db, "cierreVueloFuel", row.id), {
      ticketNumber,
      gallons: numberValue(gallons),
      agent,
      supervisor,
      flightNumber,
      notes,
      updatedBy: user?.displayName || user?.name || user?.username || "",
      updatedById: user?.id || "",
      updatedAt: serverTimestamp(),
    });

    alert("Fuel actualizado.");
  };

  const deleteFuel = async (row) => {
    const confirmDelete = window.confirm(
      `¿Seguro que quieres borrar el Fuel Ticket ${row.ticketNumber || ""}?`
    );

    if (!confirmDelete) return;

    await deleteDoc(doc(db, "cierreVueloFuel", row.id));

    alert("Fuel borrado.");
  };

  const exportFlightsCSV = () => {
    const headers = [
      "Fecha",
      "MesClave",
      "Airline",
      "Vuelo",
      "PAX",
      "Maletas",
      "Card_Qty",
      "Card_$",
      "Cash_Qty",
      "Cash_$",
      "Ancillaries_$",
      "Ag_Ventas",
      "Ag_$",
      "Supervisor",
      "Agente_Cierre",
    ];

    const rows = filteredFlights.map((row) => [
      row.date,
      row.monthKey,
      row.airline,
      row.flightNumber,
      row.pax,
      row.bags,
      row.totals?.cardQty,
      row.totals?.cardAmount,
      row.totals?.cashQty,
      row.totals?.cashAmount,
      row.totals?.ancillaryAmount,
      row.totals?.agentSales,
      row.totals?.agentAmount,
      row.supervisor,
      row.closingAgent,
    ]);

    downloadCSV("cierre_vuelo_registro_mes.csv", headers, rows);
  };

  const exportFuelCSV = () => {
    const headers = [
      "Fecha",
      "MesClave",
      "Airline",
      "NoTicket",
      "FuelAmount_Gallons",
      "Agente",
      "Supervisor",
      "Vuelo",
      "Notas",
    ];

    const rows = filteredFuel.map((row) => [
      row.date,
      row.monthKey,
      row.airline,
      row.ticketNumber,
      row.gallons,
      row.agent,
      row.supervisor,
      row.flightNumber,
      row.notes,
    ]);

    downloadCSV("cierre_vuelo_fuel.csv", headers, rows);
  };

  const exportAgentsCSV = () => {
    const headers = ["Agente", "Ventas", "Monto"];
    const rows = agentReport.map((row) => [row.agent, row.ventas, row.monto]);

    downloadCSV("cierre_vuelo_agentes.csv", headers, rows);
  };

  const exportPDF = () => {
    const docPdf = new jsPDF("landscape");
    const airline = filters.airline || "All Airlines";
    const month = filters.monthKey || "All Months";

    docPdf.setFontSize(16);
    docPdf.text("Cierre de Vuelo Management Report", 14, 15);

    docPdf.setFontSize(10);
    docPdf.text(`Airline: ${airline}`, 14, 24);
    docPdf.text(`Month: ${month}`, 14, 30);
    docPdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 36);

    autoTable(docPdf, {
      startY: 44,
      head: [["Summary", "Total"]],
      body: [
        ["Vuelos del Mes", monthlyReport.vuelos],
        ["Total PAX", monthlyReport.pax],
        ["Total Maletas", monthlyReport.bags],
        ["Card Total", formatMoney(monthlyReport.cardAmount)],
        ["Cash Total", formatMoney(monthlyReport.cashAmount)],
        ["Ancillaries Total", formatMoney(monthlyReport.ancillaryAmount)],
        ["Ventas Agentes", monthlyReport.agentSales],
        ["Fuel Gallons", monthlyReport.fuelGallons],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [23, 105, 170] },
    });

    autoTable(docPdf, {
      startY: docPdf.lastAutoTable.finalY + 10,
      head: [[
        "Fecha",
        "Airline",
        "Vuelo",
        "PAX",
        "Maletas",
        "Card $",
        "Cash $",
        "Ancillaries $",
        "Supervisor",
        "Agent Closing",
      ]],
      body: filteredFlights.map((row) => [
        row.date || "",
        row.airline || "",
        row.flightNumber || "",
        row.pax || 0,
        row.bags || 0,
        formatMoney(row.totals?.cardAmount),
        formatMoney(row.totals?.cashAmount),
        formatMoney(row.totals?.ancillaryAmount),
        row.supervisor || "",
        row.closingAgent || "",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [23, 105, 170] },
    });

    autoTable(docPdf, {
      startY: docPdf.lastAutoTable.finalY + 10,
      head: [["Fuel Date", "Airline", "Ticket", "Gallons", "Agent", "Supervisor", "Vuelo"]],
      body: filteredFuel.map((row) => [
        row.date || "",
        row.airline || "",
        row.ticketNumber || "",
        row.gallons || 0,
        row.agent || "",
        row.supervisor || "",
        row.flightNumber || "",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [23, 105, 170] },
    });

    docPdf.save(`cierre_vuelo_management_${airline}_${month}.pdf`);
  };

  const printReport = () => {
    window.print();
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>TPA OPS SYSTEM</div>
          <h1 style={titleStyle}>Cierre de Vuelo Management</h1>
          <p style={subtitleStyle}>
            Registro mensual, fuel, agentes, conceptos, resumen anual y cierre de mes.
          </p>
        </div>

        <div style={statusBadgeStyle(isClosed)}>
          {filters.airline && filters.monthKey
            ? isClosed
              ? "MONTH CLOSED"
              : "MONTH OPEN"
            : "SELECT MONTH"}
        </div>
      </div>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Filters</h2>

        <div style={filterGridStyle}>
          <label style={labelStyle}>
            Airline
            <select
              value={filters.airline}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  airline: e.target.value,
                }))
              }
              style={inputStyle}
            >
              <option value="">All Airlines</option>
              {airlines.map((airline) => (
                <option key={airline} value={airline}>
                  {airline}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Month
            <select
              value={filters.monthKey}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  monthKey: e.target.value,
                }))
              }
              style={inputStyle}
            >
              <option value="">All Months</option>
              {getYearMonthOptions().map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={actionRowStyle}>
          <button onClick={exportFlightsCSV} style={buttonBlue}>
            Export Registro Mes
          </button>

          <button onClick={exportFuelCSV} style={buttonBlue}>
            Export Fuel
          </button>

          <button onClick={exportAgentsCSV} style={buttonBlue}>
            Export Agents
          </button>

          <button onClick={exportPDF} style={buttonBlue}>
            Export PDF
          </button>

          <button onClick={printReport} style={buttonGray}>
            Print Report
          </button>

          <button onClick={closeMonth} style={buttonRed}>
            Close Month
          </button>

          <button onClick={reopenMonth} style={buttonGreen}>
            Reopen Month
          </button>
        </div>
      </section>

      <section style={summaryGridStyle}>
        <SummaryBox label="Vuelos del Mes" value={monthlyReport.vuelos} />
        <SummaryBox label="Total PAX" value={monthlyReport.pax} />
        <SummaryBox label="Total Maletas" value={monthlyReport.bags} />
        <SummaryBox
          label="Ancillaries $"
          value={formatMoney(monthlyReport.ancillaryAmount)}
        />
        <SummaryBox label="Cash $" value={formatMoney(monthlyReport.cashAmount)} />
        <SummaryBox label="Card $" value={formatMoney(monthlyReport.cardAmount)} />
        <SummaryBox label="Ventas Agentes" value={monthlyReport.agentSales} />
        <SummaryBox label="Fuel Gallons" value={monthlyReport.fuelGallons} />
      </section>

      <ReportTable
        title="Registro del Mes"
        headers={[
          "Fecha",
          "MesClave",
          "Airline",
          "Vuelo",
          "PAX",
          "Maletas",
          "Card_Qty",
          "Card_$",
          "Cash_Qty",
          "Cash_$",
          "Ancillaries_$",
          "Ag_Ventas",
          "Ag_$",
          "Supervisor",
          "Agente_Cierre",
          "Actions",
        ]}
        rows={filteredFlights.map((row) => [
          row.date,
          row.monthKey,
          row.airline,
          row.flightNumber,
          row.pax,
          row.bags,
          row.totals?.cardQty,
          formatMoney(row.totals?.cardAmount),
          row.totals?.cashQty,
          formatMoney(row.totals?.cashAmount),
          formatMoney(row.totals?.ancillaryAmount),
          row.totals?.agentSales,
          formatMoney(row.totals?.agentAmount),
          row.supervisor,
          row.closingAgent,
          <div style={tableActionStyle}>
            <button onClick={() => editFlight(row)} style={smallButtonBlue}>
              Edit
            </button>
            <button onClick={() => deleteFlight(row)} style={smallButtonRed}>
              Delete
            </button>
          </div>,
        ])}
      />

      <ReportTable
        title="Registro Fuel Mes"
        headers={[
          "Fecha",
          "MesClave",
          "Airline",
          "NoTicket",
          "FuelAmount_Gallons",
          "Agente",
          "Supervisor",
          "Vuelo",
          "Notas",
          "Actions",
        ]}
        rows={filteredFuel.map((row) => [
          row.date,
          row.monthKey,
          row.airline,
          row.ticketNumber,
          row.gallons,
          row.agent,
          row.supervisor,
          row.flightNumber,
          row.notes,
          <div style={tableActionStyle}>
            <button onClick={() => editFuel(row)} style={smallButtonBlue}>
              Edit
            </button>
            <button onClick={() => deleteFuel(row)} style={smallButtonRed}>
              Delete
            </button>
          </div>,
        ])}
      />

      <ReportTable
        title="Registro Agentes Mes"
        headers={["Agente", "Ventas", "$ Mes", "% Ventas", "% $"]}
        rows={agentReport.map((row) => [
          row.agent,
          row.ventas,
          formatMoney(row.monto),
          monthlyReport.agentSales
            ? `${((row.ventas / monthlyReport.agentSales) * 100).toFixed(1)}%`
            : "0%",
          monthlyReport.agentAmount
            ? `${((row.monto / monthlyReport.agentAmount) * 100).toFixed(1)}%`
            : "0%",
        ])}
      />

      <ReportTable
        title="Registro Conceptos Mes"
        headers={["Tipo", "Concepto", "Cantidad", "Monto"]}
        rows={conceptReport.map((row) => [
          row.type,
          row.concept,
          row.cantidad,
          formatMoney(row.monto),
        ])}
      />

      <ReportTable
        title="Resumen Anual"
        headers={[
          "Mes",
          "Vuelos",
          "Total PAX",
          "Total Maletas",
          "Ancillaries $",
          "Ventas Agentes",
          "Fuel Gallons",
        ]}
        rows={annualSummary.map((row) => [
          row.month,
          row.vuelos,
          row.pax,
          row.bags,
          formatMoney(row.ancillaries),
          row.agentSales,
          row.fuelGallons,
        ])}
      />
    </div>
  );
}

function downloadCSV(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function ReportTable({ title, headers, rows }) {
  return (
    <section style={cardStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header} style={thStyle}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={headers.length}>
                  No records found.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} style={tdStyle}>
                      {cell ?? ""}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryBox({ label, value }) {
  return (
    <div style={summaryBoxStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

const pageStyle = {
  display: "grid",
  gap: 18,
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  background: "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
  borderRadius: 24,
  padding: 24,
  color: "#fff",
  boxShadow: "0 18px 40px rgba(15,76,129,0.20)",
};

const eyebrowStyle = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: "0.16em",
  opacity: 0.85,
};

const titleStyle = {
  margin: "6px 0 4px",
  fontSize: 34,
  fontWeight: 900,
};

const subtitleStyle = {
  margin: 0,
  opacity: 0.9,
  fontWeight: 600,
};

const statusBadgeStyle = (closed) => ({
  background: closed ? "#dc2626" : "#16a34a",
  color: "#fff",
  borderRadius: 999,
  padding: "12px 16px",
  fontWeight: 900,
  boxShadow: "0 10px 24px rgba(15,23,42,0.18)",
});

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 22,
  padding: 20,
  boxShadow: "0 14px 34px rgba(15,23,42,0.08)",
};

const sectionTitleStyle = {
  margin: "0 0 16px",
  color: "#0f172a",
  fontSize: 22,
  fontWeight: 900,
};

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const labelStyle = {
  display: "grid",
  gap: 7,
  fontSize: 13,
  fontWeight: 800,
  color: "#334155",
};

const inputStyle = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  padding: "11px 12px",
  fontSize: 14,
  boxSizing: "border-box",
};

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 18,
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const summaryBoxStyle = {
  background: "#ffffff",
  border: "1px solid #d7e9fb",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 12px 28px rgba(15,23,42,0.07)",
};

const summaryLabelStyle = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const summaryValueStyle = {
  marginTop: 6,
  color: "#0f172a",
  fontSize: 24,
  fontWeight: 900,
};

const tableWrapStyle = {
  overflowX: "auto",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 850,
};

const thStyle = {
  background: "#edf7ff",
  color: "#1769aa",
  padding: 10,
  textAlign: "left",
  fontSize: 12,
  fontWeight: 900,
  borderBottom: "1px solid #cfe7fb",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: 9,
  borderBottom: "1px solid #e2e8f0",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const tableActionStyle = {
  display: "flex",
  gap: 8,
};

const buttonBlue = {
  border: "none",
  background: "#1769aa",
  color: "#fff",
  borderRadius: 14,
  padding: "11px 14px",
  fontWeight: 900,
  cursor: "pointer",
};

const buttonGray = {
  border: "none",
  background: "#475569",
  color: "#fff",
  borderRadius: 14,
  padding: "11px 14px",
  fontWeight: 900,
  cursor: "pointer",
};

const buttonRed = {
  border: "none",
  background: "#dc2626",
  color: "#fff",
  borderRadius: 14,
  padding: "11px 14px",
  fontWeight: 900,
  cursor: "pointer",
};

const buttonGreen = {
  border: "none",
  background: "#16a34a",
  color: "#fff",
  borderRadius: 14,
  padding: "11px 14px",
  fontWeight: 900,
  cursor: "pointer",
};

const smallButtonBlue = {
  border: "none",
  background: "#1769aa",
  color: "#fff",
  borderRadius: 10,
  padding: "7px 10px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

const smallButtonRed = {
  border: "none",
  background: "#dc2626",
  color: "#fff",
  borderRadius: 10,
  padding: "7px 10px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};
