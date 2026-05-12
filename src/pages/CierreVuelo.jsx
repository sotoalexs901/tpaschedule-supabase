import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
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

const CARD_CONCEPTS = [
  "SEAT",
  "CARRY-ON",
  "EXT.BAG",
  "OVERSIZE",
  "UPGR",
  "PRIORITY BOARD",
  "OVERW",
  "PETC",
  "TICKET",
  "PASS",
];

const CASH_CONCEPTS = [
  "SEAT",
  "CARRY-ON",
  "EXT.BAG",
  "OVERSIZE",
  "UPGR",
  "OVERW",
  "CARRY-ON GATE",
  "PASS",
];

const AGENT_TEMPLATE = [
  { agent: "", ventas: "", monto: "", authCode: "", pnr: "" },
  { agent: "", ventas: "", monto: "", authCode: "", pnr: "" },
  { agent: "", ventas: "", monto: "", authCode: "", pnr: "" },
  { agent: "", ventas: "", monto: "", authCode: "", pnr: "" },
];

function money(value) {
  return Number(value || 0);
}

function qty(value) {
  return Number(value || 0);
}

function formatMoney(value) {
  return `$${money(value).toFixed(2)}`;
}

function getMonthKey(dateValue) {
  if (!dateValue) return "";
  return String(dateValue).slice(0, 7);
}

function emptyConcepts(list) {
  return list.map((concept) => ({
    concept,
    cantidad: "",
    monto: "",
    comments: "",
    pnr: "",
  }));
}

function getUserName(person) {
  return (
    person?.displayName ||
    person?.fullName ||
    person?.name ||
    person?.username ||
    ""
  );
}

export default function CierreVuelo() {
  const { user } = useUser();

  const [employeeOptions, setEmployeeOptions] = useState([]);

  const [airlines, setAirlines] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cierreVueloAirlines"));
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {
      // ignore
    }

    return DEFAULT_AIRLINES;
  });

  const [newAirline, setNewAirline] = useState("");

  const [flight, setFlight] = useState({
    date: "",
    airline: "",
    flightNumber: "",
    pax: "",
    bags: "",
    supervisor: "",
    closingAgent: "",
  });

  const [cardConcepts, setCardConcepts] = useState(() =>
    emptyConcepts(CARD_CONCEPTS)
  );

  const [cashConcepts, setCashConcepts] = useState(() =>
    emptyConcepts(CASH_CONCEPTS)
  );

  const [agents, setAgents] = useState(AGENT_TEMPLATE);

  const [fuel, setFuel] = useState({
    date: "",
    airline: "",
    ticketNumber: "",
    gallons: "",
    agent: "",
    supervisor: "",
    flightNumber: "",
    notes: "",
  });

  const [savingFlight, setSavingFlight] = useState(false);
  const [savingFuel, setSavingFuel] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const names = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .map(getUserName)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));

        setEmployeeOptions(Array.from(new Set(names)));
      },
      (error) => console.error("Error loading users:", error)
    );

    return () => unsub();
  }, []);

  const monthKey = getMonthKey(flight.date);

  const totals = useMemo(() => {
    const cardQty = cardConcepts.reduce(
      (sum, row) => sum + qty(row.cantidad),
      0
    );

    const cardAmount = cardConcepts.reduce(
      (sum, row) => sum + money(row.monto),
      0
    );

    const cashQty = cashConcepts.reduce(
      (sum, row) => sum + qty(row.cantidad),
      0
    );

    const cashAmount = cashConcepts.reduce(
      (sum, row) => sum + money(row.monto),
      0
    );

    const agentSales = agents.reduce(
      (sum, row) => sum + qty(row.ventas),
      0
    );

    const agentAmount = agents.reduce(
      (sum, row) => sum + money(row.monto),
      0
    );

    return {
      cardQty,
      cardAmount,
      cashQty,
      cashAmount,
      ancillaryAmount: cardAmount + cashAmount,
      agentSales,
      agentAmount,
    };
  }, [cardConcepts, cashConcepts, agents]);

  const addAirline = () => {
    const clean = newAirline.trim();
    if (!clean) return;

    const updated = Array.from(new Set([...airlines, clean]));
    setAirlines(updated);
    setFlight((prev) => ({ ...prev, airline: clean }));
    setFuel((prev) => ({ ...prev, airline: clean }));
    setNewAirline("");

    localStorage.setItem("cierreVueloAirlines", JSON.stringify(updated));
  };

  const updateConcept = (type, index, key, value) => {
    const setter = type === "card" ? setCardConcepts : setCashConcepts;

    setter((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      )
    );
  };

  const updateAgent = (index, key, value) => {
    setAgents((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      )
    );
  };

  const addAgentRow = () => {
    setAgents((prev) => [
      ...prev,
      { agent: "", ventas: "", monto: "", authCode: "", pnr: "" },
    ]);
  };

  const clearFlightForm = () => {
    setFlight({
      date: "",
      airline: "",
      flightNumber: "",
      pax: "",
      bags: "",
      supervisor: "",
      closingAgent: "",
    });

    setCardConcepts(emptyConcepts(CARD_CONCEPTS));
    setCashConcepts(emptyConcepts(CASH_CONCEPTS));
    setAgents(AGENT_TEMPLATE);

    setFuel((prev) => ({
      ...prev,
      supervisor: "",
      agent: "",
      flightNumber: "",
    }));
  };

  const saveFlight = async (event) => {
    event.preventDefault();

    if (!flight.date || !flight.airline || !flight.flightNumber) {
      alert("Fecha, Airline y Vuelo son requeridos.");
      return;
    }

    setSavingFlight(true);

    try {
      const cleanCardConcepts = cardConcepts.filter(
        (row) => qty(row.cantidad) > 0 || money(row.monto) > 0
      );

      const cleanCashConcepts = cashConcepts.filter(
        (row) => qty(row.cantidad) > 0 || money(row.monto) > 0
      );

      const cleanAgents = agents.filter(
        (row) =>
          row.agent ||
          qty(row.ventas) > 0 ||
          money(row.monto) > 0 ||
          row.authCode ||
          row.pnr
      );

      await addDoc(collection(db, "cierreVueloFlights"), {
        ...flight,
        monthKey,
        pax: qty(flight.pax),
        bags: qty(flight.bags),

        cardConcepts: cleanCardConcepts.map((row) => ({
          ...row,
          cantidad: qty(row.cantidad),
          monto: money(row.monto),
        })),

        cashConcepts: cleanCashConcepts.map((row) => ({
          ...row,
          cantidad: qty(row.cantidad),
          monto: money(row.monto),
        })),

        agents: cleanAgents.map((row) => ({
          ...row,
          ventas: qty(row.ventas),
          monto: money(row.monto),
        })),

        totals,
        status: "OPEN",
        createdBy: user?.displayName || user?.name || user?.username || "",
        createdById: user?.id || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert("Cierre de vuelo guardado.");
      clearFlightForm();
    } catch (error) {
      console.error("Error saving cierre vuelo:", error);
      alert("Error guardando el cierre de vuelo.");
    } finally {
      setSavingFlight(false);
    }
  };

  const clearFuelForm = () => {
    setFuel({
      date: "",
      airline: flight.airline || "",
      ticketNumber: "",
      gallons: "",
      agent: "",
      supervisor: flight.supervisor || "",
      flightNumber: flight.flightNumber || "",
      notes: "",
    });
  };

  const saveFuel = async (event) => {
    event.preventDefault();

    if (!fuel.date || !fuel.airline || !fuel.ticketNumber) {
      alert("Fecha, Airline y No. Ticket son requeridos.");
      return;
    }

    setSavingFuel(true);

    try {
      await addDoc(collection(db, "cierreVueloFuel"), {
        ...fuel,
        monthKey: getMonthKey(fuel.date),
        gallons: qty(fuel.gallons),
        createdBy: user?.displayName || user?.name || user?.username || "",
        createdById: user?.id || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert("Fuel Slip guardado.");
      clearFuelForm();
    } catch (error) {
      console.error("Error saving fuel slip:", error);
      alert("Error guardando Fuel Slip.");
    } finally {
      setSavingFuel(false);
    }
  };

  const exportFlightPDF = () => {
    if (!flight.date || !flight.airline || !flight.flightNumber) {
      alert("Completa Fecha, Airline y Vuelo antes de exportar el PDF.");
      return;
    }

    const doc = new jsPDF("landscape");

    doc.setFontSize(16);
    doc.text("Cierre de Vuelo", 14, 15);

    doc.setFontSize(10);
    doc.text(`Airline: ${flight.airline}`, 14, 24);
    doc.text(`Fecha: ${flight.date}`, 14, 30);
    doc.text(`MesClave: ${monthKey}`, 14, 36);
    doc.text(`Vuelo: ${flight.flightNumber}`, 14, 42);
    doc.text(`Supervisor: ${flight.supervisor || ""}`, 14, 48);
    doc.text(`Agent Closing: ${flight.closingAgent || ""}`, 14, 54);

    autoTable(doc, {
      startY: 62,
      head: [["Item", "Value"]],
      body: [
        ["Total Pasajeros", flight.pax || 0],
        ["Total Maletas", flight.bags || 0],
        ["Card Qty", totals.cardQty],
        ["Card Total", formatMoney(totals.cardAmount)],
        ["Cash Qty", totals.cashQty],
        ["Cash Total", formatMoney(totals.cashAmount)],
        ["Ancillaries Total", formatMoney(totals.ancillaryAmount)],
        ["Agent Sales", totals.agentSales],
        ["Agent Total", formatMoney(totals.agentAmount)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [23, 105, 170] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Tipo", "Concepto", "Cantidad", "Monto", "Comments", "PNR"]],
      body: [
        ...cardConcepts
          .filter((row) => qty(row.cantidad) > 0 || money(row.monto) > 0)
          .map((row) => [
            "CARD",
            row.concept,
            row.cantidad || 0,
            formatMoney(row.monto),
            row.comments || "",
            row.pnr || "",
          ]),
        ...cashConcepts
          .filter((row) => qty(row.cantidad) > 0 || money(row.monto) > 0)
          .map((row) => [
            "CASH",
            row.concept,
            row.cantidad || 0,
            formatMoney(row.monto),
            row.comments || "",
            row.pnr || "",
          ]),
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [23, 105, 170] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Agent", "Ventas", "Monto", "Auth Code", "PNR"]],
      body: agents
        .filter(
          (row) =>
            row.agent ||
            qty(row.ventas) > 0 ||
            money(row.monto) > 0 ||
            row.authCode ||
            row.pnr
        )
        .map((row) => [
          row.agent || "",
          row.ventas || 0,
          formatMoney(row.monto),
          row.authCode || "",
          row.pnr || "",
        ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [23, 105, 170] },
    });

    doc.save(`cierre_vuelo_${flight.airline}_${flight.flightNumber}_${flight.date}.pdf`);
  };

  const exportFuelPDF = () => {
    if (!fuel.date || !fuel.airline || !fuel.ticketNumber) {
      alert("Completa Fecha, Airline y No. Ticket antes de exportar el PDF.");
      return;
    }

    const doc = new jsPDF("portrait");

    doc.setFontSize(16);
    doc.text("Fuel Slip", 14, 15);

    doc.setFontSize(10);
    doc.text(`Airline: ${fuel.airline}`, 14, 24);
    doc.text(`Fecha: ${fuel.date}`, 14, 30);
    doc.text(`MesClave: ${getMonthKey(fuel.date)}`, 14, 36);

    autoTable(doc, {
      startY: 46,
      head: [["Field", "Value"]],
      body: [
        ["No. Ticket", fuel.ticketNumber || ""],
        ["Fuel Amount Gallons", fuel.gallons || 0],
        ["Agente", fuel.agent || ""],
        ["Supervisor", fuel.supervisor || ""],
        ["Vuelo", fuel.flightNumber || ""],
        ["Notas", fuel.notes || ""],
      ],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [23, 105, 170] },
    });

    doc.save(`fuel_slip_${fuel.airline}_${fuel.ticketNumber}_${fuel.date}.pdf`);
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>TPA OPS SYSTEM</div>
          <h1 style={titleStyle}>Cierre de Vuelo</h1>
          <p style={subtitleStyle}>
            Adaptado del Excel: cierre principal, card/cash, agentes y fuel slip.
          </p>
        </div>
      </div>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Airlines</h2>

        <div style={gridStyle}>
          <label style={labelStyle}>
            Airline
            <select
              value={flight.airline}
              onChange={(e) => {
                setFlight((prev) => ({ ...prev, airline: e.target.value }));
                setFuel((prev) => ({ ...prev, airline: e.target.value }));
              }}
              style={inputStyle}
            >
              <option value="">Select Airline</option>
              {airlines.map((airline) => (
                <option key={airline} value={airline}>
                  {airline}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Agregar Airline
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={newAirline}
                onChange={(e) => setNewAirline(e.target.value)}
                style={inputStyle}
                placeholder="New airline"
              />
              <button type="button" onClick={addAirline} style={buttonBlue}>
                Add
              </button>
            </div>
          </label>
        </div>
      </section>

      <form onSubmit={saveFlight} style={cardStyle}>
        <h2 style={sectionTitleStyle}>Cierre de Vuelo / Cierre de Caja</h2>

        <div style={gridStyle}>
          <label style={labelStyle}>
            Fecha
            <input
              type="date"
              value={flight.date}
              onChange={(e) =>
                setFlight((prev) => ({ ...prev, date: e.target.value }))
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            MesClave
            <input value={monthKey} readOnly style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Vuelo
            <input
              value={flight.flightNumber}
              onChange={(e) => {
                setFlight((prev) => ({
                  ...prev,
                  flightNumber: e.target.value,
                }));
                setFuel((prev) => ({
                  ...prev,
                  flightNumber: e.target.value,
                }));
              }}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Total Pasajeros
            <input
              type="number"
              value={flight.pax}
              onChange={(e) =>
                setFlight((prev) => ({ ...prev, pax: e.target.value }))
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Total Maletas
            <input
              type="number"
              value={flight.bags}
              onChange={(e) =>
                setFlight((prev) => ({ ...prev, bags: e.target.value }))
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Supervisor
            <select
              value={flight.supervisor}
              onChange={(e) => {
                setFlight((prev) => ({
                  ...prev,
                  supervisor: e.target.value,
                }));

                setFuel((prev) => ({
                  ...prev,
                  supervisor: e.target.value,
                }));
              }}
              style={inputStyle}
            >
              <option value="">Select Supervisor</option>
              {employeeOptions.map((name) => (
                <option key={`supervisor-${name}`} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Agent Closing
            <select
              value={flight.closingAgent}
              onChange={(e) =>
                setFlight((prev) => ({
                  ...prev,
                  closingAgent: e.target.value,
                }))
              }
              style={inputStyle}
            >
              <option value="">Select Agent Closing</option>
              {employeeOptions.map((name) => (
                <option key={`closing-${name}`} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h3 style={subSectionTitleStyle}>Tarjeta / Card</h3>
        <ConceptTable
          rows={cardConcepts}
          type="card"
          onChange={updateConcept}
        />

        <h3 style={subSectionTitleStyle}>Efectivo / Cash</h3>
        <ConceptTable
          rows={cashConcepts}
          type="cash"
          onChange={updateConcept}
        />

        <h3 style={subSectionTitleStyle}>Agents</h3>
        <AgentTable
          rows={agents}
          onChange={updateAgent}
          employeeOptions={employeeOptions}
        />

        <button type="button" onClick={addAgentRow} style={buttonLight}>
          + Add Agent Row
        </button>

        <div style={summaryGridStyle}>
          <SummaryBox label="Card Qty" value={totals.cardQty} />
          <SummaryBox label="Card $" value={`$${totals.cardAmount.toFixed(2)}`} />
          <SummaryBox label="Cash Qty" value={totals.cashQty} />
          <SummaryBox label="Cash $" value={`$${totals.cashAmount.toFixed(2)}`} />
          <SummaryBox
            label="Ancillaries $"
            value={`$${totals.ancillaryAmount.toFixed(2)}`}
          />
          <SummaryBox label="Agent Sales" value={totals.agentSales} />
          <SummaryBox
            label="Agent $"
            value={`$${totals.agentAmount.toFixed(2)}`}
          />
        </div>

        <div style={actionRowStyle}>
          <button type="submit" disabled={savingFlight} style={buttonGreen}>
            {savingFlight ? "Saving..." : "Guardar Vuelo"}
          </button>

          <button type="button" onClick={exportFlightPDF} style={buttonBlue}>
            Export Flight PDF
          </button>

          <button type="button" onClick={clearFlightForm} style={buttonGray}>
            Limpiar Form
          </button>
        </div>
      </form>

      <form onSubmit={saveFuel} style={cardStyle}>
        <h2 style={sectionTitleStyle}>Fuel Slip</h2>

        <div style={gridStyle}>
          <label style={labelStyle}>
            Fecha
            <input
              type="date"
              value={fuel.date}
              onChange={(e) =>
                setFuel((prev) => ({ ...prev, date: e.target.value }))
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            MesClave
            <input value={getMonthKey(fuel.date)} readOnly style={inputStyle} />
          </label>

          <label style={labelStyle}>
            No. Ticket
            <input
              value={fuel.ticketNumber}
              onChange={(e) =>
                setFuel((prev) => ({
                  ...prev,
                  ticketNumber: e.target.value,
                }))
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Fuel Amount Gallons
            <input
              type="number"
              value={fuel.gallons}
              onChange={(e) =>
                setFuel((prev) => ({ ...prev, gallons: e.target.value }))
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Agente
            <select
              value={fuel.agent}
              onChange={(e) =>
                setFuel((prev) => ({ ...prev, agent: e.target.value }))
              }
              style={inputStyle}
            >
              <option value="">Select Agent</option>
              {employeeOptions.map((name) => (
                <option key={`fuel-agent-${name}`} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Supervisor
            <input value={fuel.supervisor} readOnly style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Vuelo
            <input
              value={fuel.flightNumber}
              onChange={(e) =>
                setFuel((prev) => ({
                  ...prev,
                  flightNumber: e.target.value,
                }))
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Notas
            <input
              value={fuel.notes}
              onChange={(e) =>
                setFuel((prev) => ({ ...prev, notes: e.target.value }))
              }
              style={inputStyle}
            />
          </label>
        </div>

        <div style={actionRowStyle}>
          <button type="submit" disabled={savingFuel} style={buttonGreen}>
            {savingFuel ? "Saving..." : "Guardar Fuel"}
          </button>

          <button type="button" onClick={exportFuelPDF} style={buttonBlue}>
            Export Fuel PDF
          </button>

          <button type="button" onClick={clearFuelForm} style={buttonGray}>
            Limpiar Fuel
          </button>
        </div>
      </form>
    </div>
  );
}

function ConceptTable({ rows, type, onChange }) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Concepto</th>
            <th style={thStyle}>Cantidad</th>
            <th style={thStyle}>Monto</th>
            <th style={thStyle}>Comments</th>
            <th style={thStyle}>PNR&apos;s</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${type}-${row.concept}`}>
              <td style={tdStyle}>{row.concept}</td>
              <td style={tdStyle}>
                <input
                  type="number"
                  value={row.cantidad}
                  onChange={(e) =>
                    onChange(type, index, "cantidad", e.target.value)
                  }
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number"
                  value={row.monto}
                  onChange={(e) =>
                    onChange(type, index, "monto", e.target.value)
                  }
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  value={row.comments}
                  onChange={(e) =>
                    onChange(type, index, "comments", e.target.value)
                  }
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  value={row.pnr}
                  onChange={(e) => onChange(type, index, "pnr", e.target.value)}
                  style={tableInputStyle}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentTable({ rows, onChange, employeeOptions }) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Agent</th>
            <th style={thStyle}>Cantidad de Ventas</th>
            <th style={thStyle}>Monto</th>
            <th style={thStyle}>Auth Code</th>
            <th style={thStyle}>PNR&apos;s</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`agent-${index}`}>
              <td style={tdStyle}>
                <select
                  value={row.agent}
                  onChange={(e) => onChange(index, "agent", e.target.value)}
                  style={tableInputStyle}
                >
                  <option value="">Select Agent</option>
                  {employeeOptions.map((name) => (
                    <option key={`agent-${index}-${name}`} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </td>
              <td style={tdStyle}>
                <input
                  type="number"
                  value={row.ventas}
                  onChange={(e) => onChange(index, "ventas", e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number"
                  value={row.monto}
                  onChange={(e) => onChange(index, "monto", e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  value={row.authCode}
                  onChange={(e) => onChange(index, "authCode", e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  value={row.pnr}
                  onChange={(e) => onChange(index, "pnr", e.target.value)}
                  style={tableInputStyle}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

const subSectionTitleStyle = {
  margin: "24px 0 10px",
  color: "#1769aa",
  fontSize: 16,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const gridStyle = {
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

const tableWrapStyle = {
  overflowX: "auto",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 760,
};

const thStyle = {
  background: "#edf7ff",
  color: "#1769aa",
  padding: 10,
  textAlign: "left",
  fontSize: 12,
  fontWeight: 900,
  borderBottom: "1px solid #cfe7fb",
};

const tdStyle = {
  padding: 8,
  borderBottom: "1px solid #e2e8f0",
};

const tableInputStyle = {
  width: "100%",
  border: "1px solid #dbeafe",
  borderRadius: 10,
  padding: "8px 9px",
  boxSizing: "border-box",
};

const summaryGridStyle = {
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const summaryBoxStyle = {
  background: "#f8fbff",
  border: "1px solid #d7e9fb",
  borderRadius: 16,
  padding: 14,
};

const summaryLabelStyle = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const summaryValueStyle = {
  marginTop: 5,
  color: "#0f172a",
  fontSize: 21,
  fontWeight: 900,
};

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 18,
};

const buttonBlue = {
  border: "none",
  background: "#1769aa",
  color: "#fff",
  borderRadius: 14,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

const buttonGreen = {
  border: "none",
  background: "#16a34a",
  color: "#fff",
  borderRadius: 14,
  padding: "12px 18px",
  fontWeight: 900,
  cursor: "pointer",
};

const buttonGray = {
  border: "none",
  background: "#475569",
  color: "#fff",
  borderRadius: 14,
  padding: "12px 18px",
  fontWeight: 900,
  cursor: "pointer",
};

const buttonLight = {
  marginTop: 10,
  border: "1px solid #cfe7fb",
  background: "#ffffff",
  color: "#1769aa",
  borderRadius: 14,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};
