import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

function normalizeAirlineName(name) {
  const value = String(name || "").trim();
  const upper = value.toUpperCase();

  if (
    upper === "WL HAVANA AIR" ||
    upper === "WAL HAVANA AIR" ||
    upper === "WAL HAVANA" ||
    upper === "WAL" ||
    upper === "WL HAVANA"
  ) {
    return "WestJet";
  }

  return value;
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState([]);
  const [airline, setAirline] = useState("");
  const [department, setDepartment] = useState("");
  const [hours, setHours] = useState("");

  const loadBudgets = async () => {
    const snap = await getDocs(collection(db, "airlineBudgets"));
    const arr = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        airline: normalizeAirlineName(data.airline),
      };
    });
    setBudgets(arr);
  };

  useEffect(() => {
    loadBudgets();
  }, []);

  const createBudget = async () => {
    if (!airline || !hours) return alert("Missing info");

    await addDoc(collection(db, "airlineBudgets"), {
      airline: normalizeAirlineName(airline),
      department,
      budgetHours: Number(hours),
    });

    setAirline("");
    setDepartment("");
    setHours("");

    loadBudgets();
  };

  const updateBudget = async (id, newHours) => {
    await updateDoc(doc(db, "airlineBudgets", id), {
      budgetHours: Number(newHours),
    });
    loadBudgets();
  };

  const deleteBudget = async (id) => {
    if (!window.confirm("Delete this budget?")) return;
    await deleteDoc(doc(db, "airlineBudgets", id));
    loadBudgets();
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-slate-800">
        Airline Budget Config
      </h1>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="font-semibold text-slate-800">Add / Update Budget</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Airline (SY, AV, WestJet...)"
            value={airline}
            onChange={(e) => setAirline(normalizeAirlineName(e.target.value))}
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Department (Ramp, TC, BSO...)"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />

          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Weekly Hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>

        <button
          onClick={createBudget}
          className="w-full rounded-lg px-4 py-2 font-semibold text-white"
          style={{ backgroundColor: "#22B8B0" }}
        >
          Save Budget
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold mb-3 text-slate-800">Existing Budgets</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-2 text-left">Airline</th>
                <th className="p-2 text-left">Department</th>
                <th className="p-2 text-left">Hours</th>
                <th className="p-2"></th>
              </tr>
            </thead>

            <tbody>
              {budgets.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="p-2 font-medium text-slate-800">
                    {normalizeAirlineName(b.airline)}
                  </td>
                  <td className="p-2 text-slate-700">{b.department}</td>
                  <td className="p-2">
                    <input
                      className="border rounded-md px-2 py-1 w-24"
                      defaultValue={b.budgetHours}
                      onBlur={(e) => updateBudget(b.id, e.target.value)}
                    />
                  </td>
                  <td className="p-2 text-right">
                    <button
                      className="text-red-600 text-xs font-semibold"
                      onClick={() => deleteBudget(b.id)}
                    >
                      DELETE
                    </button>
                  </td>
                </tr>
              ))}

              {budgets.length === 0 && (
                <tr>
                  <td colSpan="4" className="p-4 text-center text-slate-500">
                    No budgets found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
