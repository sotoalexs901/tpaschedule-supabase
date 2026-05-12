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

function safeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    const reportWindow = window.open("", "_blank");

    if (!reportWindow) {
      alert("Permite pop-ups para exportar el PDF.");
      return;
    }

    const airline = filters.airline || "All Airlines";
    const month = filters.monthKey || "All Months";

    const flightRowsHtml = filteredFlights
      .map(
        (row) => `
          <tr>
            <td>${safeHtml(row.date)}</td>
            <td>${safeHtml(row.airline)}</td>
            <td>${safeHtml(row.flightNumber)}</td>
            <td>${safeHtml(row.pax || 0)}</td>
            <td>${safeHtml(row.bags || 0)}</td>
            <td>${safeHtml(formatMoney(row.totals?.cardAmount))}</td>
            <td>${safeHtml(formatMoney(row.totals?.cashAmount))}</td>
            <td>${safeHtml(formatMoney(row.totals?.ancillaryAmount))}</td>
            <td>${safeHtml(row.supervisor)}</td>
            <td>${safeHtml(row.closingAgent)}</td>
          </tr>
        `
      )
      .join("");

    const fuelRowsHtml = filteredFuel
      .map(
        (row) => `
          <tr>
            <td>${safeHtml(row.date)}</td>
            <td>${safeHtml(row.airline)}</td>
            <td>${safeHtml(row.ticketNumber)}</td>
            <td>${safeHtml(row.gallons || 0)}</td>
            <td>${safeHtml(row.agent)}</td>
            <td>${safeHtml(row.supervisor)}</td>
            <td>${safeHtml(row.flightNumber)}</td>
          </tr>
        `
      )
      .join("");

    const agentRowsHtml = agentReport
      .map(
        (row) => `
          <tr>
            <td>${safeHtml(row.agent)}</td>
            <td>${safeHtml(row.ventas)}</td>
            <td>${safeHtml(formatMoney(row.monto))}</td>
          </tr>
        `
      )
      .join("");

    reportWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Cierre de Vuelo Report</title>
          <style>
            * {
              box-sizing: border-box;
            }

            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #0f172a;
              background: #ffffff;
            }

            h1 {
              color: #0f4c81;
              margin: 0 0 6px;
              font-size: 24px;
            }

            h2 {
              margin: 26px 0 10px;
              color: #1769aa;
              font-size: 17px;
            }

            .meta {
              font-size: 12px;
              line-height: 1.6;
              margin-bottom: 16px;
            }

            .summary {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin: 18px 0;
            }

            .box {
              border: 1px solid #cbd5e1;
              border-radius: 10px;
              padding: 10px;
              background: #f8fbff;
            }

            .label {
              font-size: 10px;
              font-weight: bold;
              color: #64748b;
              text-transform: uppercase;
            }

            .value {
              font-size: 16px;
              font-weight: bold;
              margin-top: 4px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
              font-size: 10px;
            }

            th {
              background: #1769aa;
              color: white;
              padding: 6px;
              border: 1px solid #dbeafe;
              text-align: left;
            }

            td {
              padding: 6px;
              border: 1px solid #cbd5e1;
            }

            .footer {
              margin-top: 24px;
              font-size: 10px;
              color: #64748b;
            }

            @page {
              size: landscape;
              margin: 12mm;
            }

            @media print {
              body {
                padding: 0;
              }
            }
          </style>
        </head>

        <body>
          <h1>Cierre de Vuelo Management Report</h1>

          <div class="meta">
            <strong>Airline:</strong> ${safeHtml(airline)}<br />
            <strong>Month:</strong> ${safeHtml(month)}<br />
            <strong>Status:</strong> ${safeHtml(isClosed ? "MONTH CLOSED" : "MONTH OPEN")}<br />
            <strong>Generated:</strong> ${safeHtml(new Date().toLocaleString())}
          </div>

          <div class="summary">
            <div class="box">
              <div class="label">Vuelos del Mes</div>
              <div class="value">${safeHtml(monthlyReport.vuelos)}</div>
            </div>

            <div class="box">
              <div class="label">Total PAX</div>
              <div class="value">${safeHtml(monthlyReport.pax)}</div>
            </div>

            <div class="box">
              <div class="label">Total Maletas</div>
              <div class="value">${safeHtml(monthlyReport.bags)}</div>
            </div>

            <div class="box">
              <div class="label">Ancillaries</div>
              <div class="value">${safeHtml(formatMoney(monthlyReport.ancillaryAmount))}</div>
            </div>

            <div class="box">
              <div class="label">Cash</div>
              <div class="value">${safeHtml(formatMoney(monthlyReport.cashAmount))}</div>
            </div>

            <div class="box">
              <div class="label">Card</div>
              <div class="value">${safeHtml(formatMoney(monthlyReport.cardAmount))}</div>
            </div>

            <div class="box">
              <div class="label">Ventas Agentes</div>
              <div class="value">${safeHtml(monthlyReport.agentSales)}</div>
            </div>

            <div class="box">
              <div class="label">Fuel Gallons</div>
              <div class="value">${safeHtml(monthlyReport.fuelGallons)}</div>
            </div>
          </div>

          <h2>Registro del Mes</h2>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Airline</th>
                <th>Vuelo</th>
                <th>PAX</th>
                <th>Maletas</th>
                <th>Card $</th>
                <th>Cash $</th>
                <th>Ancillaries $</th>
                <th>Supervisor</th>
                <th>Agent Closing</th>
              </tr>
            </thead>
            <tbody>
              ${
                flightRowsHtml ||
                `<tr><td colspan="10">No records found.</td></tr>`
              }
            </tbody>
          </table>

          <h2>Fuel</h2>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Airline</th>
                <th>Ticket</th>
                <th>Gallons</th>
                <th>Agent</th>
                <th>Supervisor</th>
                <th>Vuelo</th>
              </tr>
            </thead>
            <tbody>
              ${
                fuelRowsHtml ||
                `<tr><td colspan="7">No fuel records found.</td></tr>`
              }
            </tbody>
          </table>

          <h2>Agents</h2>
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Ventas</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              ${
                agentRowsHtml ||
                `<tr><td colspan="3">No agent records found.</td></tr>`
              }
            </tbody>
          </table>

          <div class="footer">
            TPA OPS SYSTEM - Cierre de Vuelo
          </div>

          <script>
            window.onload = function () {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    reportWindow.document.close();
  };

  const printReport = () => {
    exportPDF();
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
