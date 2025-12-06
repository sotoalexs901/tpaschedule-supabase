// src/pages/TimeOffRequestsAdminPage.jsx
import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function TimeOffRequestsAdminPage() {
  const { user } = useUser();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending"); // pending | approved | rejected | needs_info | all
  const [notesById, setNotesById] = useState({});

  const loadRequests = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "timeOffRequests"));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort(
        (a, b) =>
          (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      setRequests(list);
    } catch (err) {
      console.error("Error loading time off requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests().catch(console.error);
  }, []);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const updateLocalRequest = (id, patch) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const handleApprove = async (req) => {
    const note = notesById[req.id] || "";
    const confirmText = `Approve day-off for ${req.employeeName} (${req.reasonType}) from ${req.startDate} to ${req.endDate}?`;
    if (!window.confirm(confirmText)) return;

    try {
      // 1) Crear restricción para BlockedEmployees
      await addDoc(collection(db, "restrictions"), {
        employeeId: req.employeeId || null,
        employeeName: req.employeeName || "",
        reason: `TIME OFF: ${req.reasonType}${
          req.notes ? " - " + req.notes : ""
        }`,
        start_date: req.startDate,
        end_date: req.endDate,
        createdAt: serverTimestamp(),
        createdBy: user?.username || "station_manager",
        source: "timeOffRequest",
      });

      // 2) Actualizar request
      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "approved",
        managerNote: note,
        handledBy: user?.username || null,
        handledAt: serverTimestamp(),
      });

      updateLocalRequest(req.id, {
        status: "approved",
        managerNote: note,
        handledBy: user?.username || null,
      });
    } catch (err) {
      console.error("Error approving request:", err);
      window.alert("Error approving request. Try again.");
    }
  };

  const handleReject = async (req) => {
    const note = notesById[req.id] || "";
    const confirmText = `Reject day-off request from ${req.employeeName}?`;
    if (!window.confirm(confirmText)) return;

    try {
      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "rejected",
        managerNote: note,
        handledBy: user?.username || null,
        handledAt: serverTimestamp(),
      });

      updateLocalRequest(req.id, {
        status: "rejected",
        managerNote: note,
        handledBy: user?.username || null,
      });
    } catch (err) {
      console.error("Error rejecting request:", err);
      window.alert("Error rejecting request. Try again.");
    }
  };

  const handleNeedsInfo = async (req) => {
    const note = notesById[req.id] || "";
    if (!note) {
      window.alert("Please write what additional information is needed.");
      return;
    }

    const confirmText = `Mark request for ${req.employeeName} as 'More info needed'?`;
    if (!window.confirm(confirmText)) return;

    try {
      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "needs_info",
        managerNote: note,
        handledBy: user?.username || null,
        handledAt: serverTimestamp(),
      });

      updateLocalRequest(req.id, {
        status: "needs_info",
        managerNote: note,
        handledBy: user?.username || null,
      });
    } catch (err) {
      console.error("Error setting needs_info:", err);
      window.alert("Error updating request. Try again.");
    }
  };

  const handleDelete = async (req) => {
    const confirmText = `Delete this request from ${req.employeeName}? This cannot be undone.`;
    if (!window.confirm(confirmText)) return;

    try {
      await deleteDoc(doc(db, "timeOffRequests", req.id));
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
      console.error("Error deleting request:", err);
      window.alert("Error deleting request. Try again.");
    }
  };

  const handlePrint = (req) => {
    const win = window.open("", "_blank", "width=600,height=800");
    if (!win) return;

    const html = `
      <html>
        <head>
          <title>Day Off Request - ${req.employeeName}</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 20px; }
            h1 { font-size: 18px; margin-bottom: 10px; }
            p { font-size: 13px; margin: 4px 0; }
            .label { font-weight: 600; }
            hr { margin: 12px 0; }
          </style>
        </head>
        <body>
          <h1>Day Off Request</h1>
          <p><span class="label">Employee:</span> ${req.employeeName || ""}</p>
          <p><span class="label">Reason:</span> ${req.reasonType || ""}</p>
          <p><span class="label">Dates:</span> ${req.startDate} → ${req.endDate}</p>
          <p><span class="label">Status:</span> ${(req.status || "").toUpperCase()}</p>
          ${
            req.managerNote
              ? `<p><span class="label">Manager note:</span> ${req.managerNote}</p>`
              : ""
          }
          ${
            req.notes
              ? `<p><span class="label">Employee note:</span> ${req.notes}</p>`
              : ""
          }
          <hr />
          <p><span class="label">Handled by:</span> ${req.handledBy || ""}</p>
        </body>
      </html>
    `;

    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const getStatusColorClass = (status) => {
    if (status === "approved") return "text-green-600";
    if (status === "rejected") return "text-red-600";
    if (status === "needs_info") return "text-amber-600";
    return "text-slate-600";
  };

  const filteredRequests =
    filterStatus === "all"
      ? requests
      : requests.filter((r) => r.status === filterStatus);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Day Off Requests</h1>
        <div className="text-xs text-slate-500">
          Pending:{" "}
          <span className="font-semibold text-red-600">{pendingCount}</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 text-xs">
        {[
          { key: "pending", label: "Pending" },
          { key: "approved", label: "Approved" },
          { key: "rejected", label: "Rejected" },
          { key: "needs_info", label: "Needs Info" },
          { key: "all", label: "All" },
        ].map((f) => (
          <button
            key={f.key}
            className={
              "btn " +
              (filterStatus === f.key ? "btn-primary" : "")
            }
            onClick={() => setFilterStatus(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading requests...</p>
      ) : filteredRequests.length === 0 ? (
        <p className="text-sm text-gray-500">
          No requests for this filter.
        </p>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => (
            <div key={req.id} className="card">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h2 className="text-sm font-semibold">
                    {req.employeeName || "Unknown employee"}
                  </h2>
                  <p className="text-xs text-gray-600">
                    {req.reasonType} • {req.startDate} → {req.endDate}
                  </p>
                  <p
                    className={
                      "text-xs mt-1 font-semibold " +
                      getStatusColorClass(req.status)
                    }
                  >
                    Status: {(req.status || "pending").toUpperCase()}
                  </p>
                  {req.managerNote && (
                    <p className="text-[11px] text-slate-700 mt-1">
                      <span className="font-semibold">
                        Message from Management:{" "}
                      </span>
                      {req.managerNote}
                    </p>
                  )}
                </div>

                <div className="space-y-1 text-xs text-right">
                  <button
                    className="btn btn-primary"
                    onClick={() => handleApprove(req)}
                  >
                    Approve
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleNeedsInfo(req)}
                  >
                    Needs info
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleReject(req)}
                  >
                    Reject
                  </button>
                  <button
                    className="btn"
                    onClick={() => handlePrint(req)}
                  >
                    Print
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleDelete(req)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Nota para el manager */}
              <div className="mt-2">
                <label className="text-[11px] font-semibold text-slate-700">
                  Manager note (for Approved / Rejected / Needs Info)
                </label>
                <textarea
                  rows={2}
                  className="w-full border rounded px-2 py-1 text-xs mt-1"
                  placeholder='e.g. "More documentation needed, please pass by the office."'
                  value={notesById[req.id] || ""}
                  onChange={(e) =>
                    setNotesById((prev) => ({
                      ...prev,
                      [req.id]: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
