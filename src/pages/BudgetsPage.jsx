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

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState([]);
  const [airline, setAirline] = useState("");
  const [department, setDepartment] = useState("");
  const [hours, setHours] = useState("");

  const loadBudgets = async () => {
    const snap = await getDocs(collection(db, "airlineBudgets"));
    const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setBudgets(arr);
  };

  useEffect(() => {
    loadBudgets();
  }, []);

  const createBudget = async () => {
    if (!airline || !hours) return alert("Missing info");

    await addDoc(collection(db, "airlineBudgets"), {
      airline,
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
    if (!confirm("Delete this budget?")) return;
    await deleteDoc(doc(db, "airlineBudgets", id));
    loadBudgets();
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Airline Budget Config</h1>

      {/* Add New Budget */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Add / Update Budget</h2>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <input
            className="border rounded px-2 py-1"
            placeholder="Airline (SY, AV, WL...)"
            value={airline}
            onChange={(e) => setAirline(e.target.value)}
          />
          <input
            className="border rounded px-2 py-1"
            placeholder="Department (Ramp, TC, BSO...)"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />

          <input
            className="border rounded px-2 py-1"
            placeholder="Weekly Hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>

        <button onClick={createBudget} className="btn-primary w-full">
          Save Budget
        </button>
      </div>

      {/* Existing Budgets */}
      <div className="card">
        <h2 className="font-semibold mb-3">Existing Budgets</h2>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2">Airline</th>
              <th>Department</th>
              <th>Hours</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {budgets.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-2">{b.airline}</td>
                <td>{b.department}</td>
                <td>
                  <input
                    className="border rounded px-1 w-20"
                    defaultValue={b.budgetHours}
                    onBlur={(e) => updateBudget(b.id, e.target.value)}
                  />
                </td>
                <td className="text-right">
                  <button
                    className="text-red-600 text-xs"
                    onClick={() => deleteBudget(b.id)}
                  >
                    DELETE
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
