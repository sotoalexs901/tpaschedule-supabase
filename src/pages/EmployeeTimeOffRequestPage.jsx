import React, { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, getDoc, doc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function EmployeeTimeOffRequestPage() {
  const { user } = useUser();

  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [reasonType, setReasonType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pin, setPin] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // 🔗 Obtener employeeId + nombre desde el usuario logueado
  useEffect(() => {
    async function loadEmployeeProfile() {
      if (!user?.employeeId) {
        // Fallback: usamos solo username
        setEmployeeId("");
        setEmployeeName(user?.username || "");
        return;
      }

      try {
        const ref = doc(db, "employees", user.employeeId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setEmployeeId(snap.id);
          setEmployeeName(data.name || user.username || "");
        } else {
          // Si no existe el doc de employee, al menos guardamos el username
          setEmployeeId(user.employeeId);
          setEmployeeName(user.username || "");
        }
      } catch (err) {
        console.error("Error loading employee profile:", err);
        setEmployeeName(user?.username || "Unknown");
      }
    }

    loadEmployeeProfile().catch(console.error);
  }, [user]);

  const validateForm = () => {
    if (!reasonType || !startDate || !endDate) {
      setError("Please complete reason and both dates.");
      return false;
    }

    if (!pin || pin.length !== 4) {
      setError("PIN must be 4 digits.");
      return false;
    }

    if (endDate < startDate) {
      setError("End date cannot be before start date.");
      return false;
    }

    return true;
  };

  // 🔁 Verificar si ya existe un request para ese empleado y mismas fechas
  const checkDuplicateRequest = async () => {
    if (!employeeId) return false; // si no tenemos employeeId, no podemos validar bien

    const q = query(
      collection(db, "timeOffRequests"),
      where("employeeId", "==", employeeId),
      where("startDate", "==", startDate),
      where("endDate", "==", endDate)
    );

    const snap = await getDocs(q);

    if (snap.empty) return false;

    const hasActive = snap.docs.some((d) => {
      const data = d.data();
      const st = (data.status || "pending").toLowerCase();
      return !["rejected", "cancelled", "deleted"].includes(st);
    });

    return hasActive;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!validateForm()) return;

    try {
      setSubmitting(true);

      const duplicate = await checkDuplicateRequest();
      if (duplicate) {
        setError(
          "You already have a request for these dates (pending or approved). Please check your status page."
        );
        setSubmitting(false);
        return;
      }

      await addDoc(collection(db, "timeOffRequests"), {
        employeeId: employeeId || null,
        employeeName: employeeName || user?.username || "",
        userLogin: user?.username || null,
        reasonType,
        startDate, // guardamos como string YYYY-MM-DD (igual que el formulario público)
        endDate,
        pin,
        notes: notes || "",
        status: "pending",
        createdAt: serverTimestamp(),
        createdVia: "employee_portal",
      });

      setMessage("Your request has been submitted successfully.");
      setReasonType("");
      setStartDate("");
      setEndDate("");
      setPin("");
      setNotes("");
    } catch (err) {
      console.error("Error submitting time off request:", err);
      setError("There was an error submitting your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="p-4">
        <p>You must be logged in to request time off.</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-3">
      <h1 className="text-lg font-semibold">Request Day Off / PTO</h1>
      <p className="text-xs text-gray-600">
        Logged as <b>{employeeName || user.username}</b> ({user.role})
      </p>

      <form onSubmit={handleSubmit} className="card space-y-3 text-xs">
        {/* Reason */}
        <div>
          <label className="text-[11px] font-semibold block mb-1">
            Reason Type
          </label>
          <select
            className="border rounded w-full px-2 py-1 text-xs"
            value={reasonType}
            onChange={(e) => setReasonType(e.target.value)}
          >
            <option value="">Select reason</option>
            <option value="PTO">PTO</option>
            <option value="Sick">Sick</option>
            <option value="Personal">Personal</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-semibold block mb-1">
              Start Date
            </label>
            <input
              type="date"
              className="border rounded w-full px-2 py-1 text-xs"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold block mb-1">
              End Date
            </label>
            <input
              type="date"
              className="border rounded w-full px-2 py-1 text-xs"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {/* PIN */}
        <div>
          <label className="text-[11px] font-semibold block mb-1">
            4-digit PIN (same as public form)
          </label>
          <input
            type="password"
            maxLength={4}
            inputMode="numeric"
            className="border rounded w-full px-2 py-1 text-xs"
            value={pin}
            onChange={(e) =>
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-[11px] font-semibold block mb-1">
            Notes (optional)
          </label>
          <textarea
            rows={3}
            className="border rounded w-full px-2 py-1 text-xs"
            placeholder="Additional details (flight, doctor appointment, etc.)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <p className="text-[11px] text-gray-500">
          HR and Management may take up to <b>72 hours</b> to process your
          request.
        </p>

        {error && (
          <p className="text-[11px] text-red-500 text-center">{error}</p>
        )}
        {message && (
          <p className="text-[11px] text-green-600 text-center">{message}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary w-full mt-1"
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>
    </div>
  );
}
