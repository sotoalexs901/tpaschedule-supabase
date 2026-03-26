import React, { useState } from "react";

export default function CabinServicePage() {
  const [file, setFile] = useState(null);
  const [operationDate, setOperationDate] = useState("");
  const [step, setStep] = useState("upload");

  const [employees] = useState([
    { id: "1", name: "John Smith" },
    { id: "2", name: "Maria Lopez" },
    { id: "3", name: "Carlos Perez" },
    { id: "4", name: "Ana Torres" },
  ]);

  const [slots, setSlots] = useState([]);

  // 🔹 Simulación de generación de shifts
  const handleGenerate = () => {
    if (!file || !operationDate) {
      alert("Please upload a file and select a date");
      return;
    }

    const generated = [
      {
        id: 1,
        start: "04:30",
        end: "13:00",
        role: "Supervisor",
        employeeId: "",
      },
      {
        id: 2,
        start: "04:30",
        end: "13:00",
        role: "LAV",
        employeeId: "",
      },
      {
        id: 3,
        start: "04:30",
        end: "13:00",
        role: "Agent",
        employeeId: "",
      },
      {
        id: 4,
        start: "08:30",
        end: "17:00",
        role: "Agent",
        employeeId: "",
      },
      {
        id: 5,
        start: "12:30",
        end: "21:00",
        role: "Agent",
        employeeId: "",
      },
    ];

    setSlots(generated);
    setStep("assign");
  };

  const handleAssign = (slotId, employeeId) => {
    setSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId ? { ...slot, employeeId } : slot
      )
    );
  };

  const getEmployeeName = (id) => {
    const emp = employees.find((e) => e.id === id);
    return emp ? emp.name : "";
  };

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: "bold", marginBottom: 20 }}>
        Cabin Service
      </h1>

      {/* STEP 1 - UPLOAD */}
      {step === "upload" && (
        <div style={cardStyle}>
          <h2 style={titleStyle}>Upload Flight Schedule</h2>

          <div style={{ marginBottom: 10 }}>
            <label>Date:</label>
            <br />
            <input
              type="date"
              value={operationDate}
              onChange={(e) => setOperationDate(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label>Upload File (CSV / Excel / PDF):</label>
            <br />
            <input
              type="file"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>

          <button style={btnPrimary} onClick={handleGenerate}>
            Generate Shifts
          </button>
        </div>
      )}

      {/* STEP 2 - ASSIGNMENT */}
      {step === "assign" && (
        <div style={cardStyle}>
          <h2 style={titleStyle}>Assign Employees</h2>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>Role</th>
                <th>Employee</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.id}>
                  <td>{slot.start}</td>
                  <td>{slot.end}</td>
                  <td>{slot.role}</td>
                  <td>
                    <select
                      value={slot.employeeId}
                      onChange={(e) =>
                        handleAssign(slot.id, e.target.value)
                      }
                    >
                      <option value="">Select</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 20 }}>
            <button style={btnSecondary} onClick={() => setStep("upload")}>
              Back
            </button>

            <button
              style={{ ...btnPrimary, marginLeft: 10 }}
              onClick={() => alert("Schedule saved (next step: Firebase)")}
            >
              Save Schedule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* 🔹 estilos simples */
const cardStyle = {
  background: "#ffffff",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const titleStyle = {
  fontSize: 18,
  marginBottom: 15,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const btnPrimary = {
  background: "#1d4ed8",
  color: "#fff",
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

const btnSecondary = {
  background: "#e5e7eb",
  color: "#111",
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};
