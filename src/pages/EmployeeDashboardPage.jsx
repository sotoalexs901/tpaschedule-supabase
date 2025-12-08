// src/pages/EmployeeDashboardPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function EmployeeDashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔔 Load announcements
  useEffect(() => {
    async function loadAnnouncements() {
      try {
        const q = query(
          collection(db, "employeeAnnouncements"),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setAnnouncements(list);
      } catch (err) {
        console.error("Error loading announcements:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAnnouncements();
  }, []);

  const goTo = (path) => navigate(path);

  return (
    <div
      className="min-h-screen p-4 md:p-6"
      style={{
        background:
          "linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #334155 100%)",
        color: "white",
      }}
    >
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-wide">
          Welcome, {user?.username}
        </h1>
        <p className="text-sm text-slate-300">
          Crew Portal · {user?.role === "agent" ? "Agent" : "Supervisor"}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Check your schedule, request PTO, and keep up with station news.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* My Schedule */}
        <div
          onClick={() => goTo("/my-schedule")}
          className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 shadow hover:bg-white/20 cursor-pointer transition"
        >
          <div className="text-xs uppercase tracking-wider text-slate-300 font-semibold">
            My Schedule
          </div>
          <div className="text-lg font-semibold mt-1">View My Hours</div>
          <p className="text-xs text-slate-300 mt-1">
            See all approved schedules that include your shifts.
          </p>
        </div>

        {/* Request Day Off */}
        <div
          onClick={() => goTo("/request-dayoff-internal")}
          className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 shadow hover:bg-white/20 cursor-pointer transition"
        >
          <div className="text-xs uppercase tracking-wider text-slate-300 font-semibold">
            PTO / Day Off Request
          </div>
          <div className="text-lg font-semibold mt-1">Submit Request</div>
          <p className="text-xs text-slate-300 mt-1">
            HR & Management will receive and review your request.
          </p>
        </div>

        {/* PTO Status */}
        <div
          onClick={() => goTo("/dayoff-status-internal")}
          className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 shadow hover:bg-white/20 cursor-pointer transition"
        >
          <div className="text-xs uppercase tracking-wider text-slate-300 font-semibold">
            PTO Status
          </div>
          <div className="text-lg font-semibold mt-1">
            Track Request Progress
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Check if your requests are pending, approved, or returned.
          </p>
        </div>
      </div>

      {/* Announcements */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white border-b border-white/20 pb-1">
          Station News & Events
        </h2>

        {loading && (
          <div className="bg-white/10 p-3 rounded-lg border border-white/20 text-sm text-slate-300">
            Loading announcements...
          </div>
        )}

        {!loading && announcements.length === 0 && (
          <div className="bg-white/10 p-3 rounded-lg border border-white/20 text-sm text-slate-300">
            No announcements yet.
          </div>
        )}

        {!loading &&
          announcements.map((item) => (
            <div
              key={item.id}
              className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 shadow space-y-1"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-white">
                  {item.title || "Announcement"}
                </h3>
                {item.createdAt?.toDate && (
                  <span className="text-[10px] text-slate-300">
                    {item.createdAt.toDate().toLocaleDateString()}
                  </span>
                )}
              </div>

              {item.subtitle && (
                <p className="text-xs text-slate-300">{item.subtitle}</p>
              )}

              {item.body && (
                <p className="text-xs text-slate-200 whitespace-pre-line mt-1 leading-relaxed">
                  {item.body}
                </p>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
