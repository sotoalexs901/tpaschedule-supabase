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

  // 🔔 Cargar anuncios
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
        console.error("Error loading employee announcements:", err);
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
        background: "radial-gradient(circle at top, #0a0f24 0%, #020617 70%)",
        color: "white",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between mb-7">
        <button
          onClick={() => navigate("/dashboard")}
          className="px-4 py-2 rounded-lg text-sm font-medium
                     bg-[#1e293b]/60 backdrop-blur-md
                     border border-white/10 shadow-md
                     hover:bg-[#334155]/60 transition duration-200
                     text-white flex items-center gap-2"
        >
          <span style={{ fontSize: "14px" }}>←</span> Back
        </button>

        <div className="text-right">
          <h1 className="text-2xl font-bold tracking-wide text-white drop-shadow">
            Welcome, {user?.username}
          </h1>
          <p className="text-sm text-blue-300">
            {user?.role === "agent" ? "Crew Agent" : "Supervisor"}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-6 tracking-wide">
        Manage your workday, requests, and stay updated with station news.
      </p>

      {/* Quick Actions – futuristic cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Card 1: My Schedule */}
        <div
          onClick={() => goTo("/my-schedule")}
          className="p-5 rounded-xl bg-[#0f172a]/60 backdrop-blur-lg border border-white/10 shadow-lg
                     hover:shadow-blue-500/40 hover:border-blue-400/30 hover:bg-[#1e293b]/60
                     transition duration-300 cursor-pointer"
        >
          <div className="text-[11px] uppercase tracking-widest text-blue-300 font-semibold">
            My Schedule
          </div>
          <div className="text-xl font-semibold mt-1 text-white">
            Weekly Hours
          </div>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            View your approved schedules and weekly assignments.
          </p>
        </div>

        {/* Card 2: PTO Request */}
        <div
          onClick={() => goTo("/request-dayoff-internal")}
          className="p-5 rounded-xl bg-[#0f172a]/60 backdrop-blur-lg border border-white/10 shadow-lg
                     hover:shadow-blue-500/40 hover:border-blue-400/30 hover:bg-[#1e293b]/60
                     transition duration-300 cursor-pointer"
        >
          <div className="text-[11px] uppercase tracking-widest text-blue-300 font-semibold">
            PTO & Day Off
          </div>
          <div className="text-xl font-semibold mt-1 text-white">
            Send Request
          </div>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            Submit time-off requests directly to HR/Management.
          </p>
        </div>

        {/* Card 3: PTO Status */}
        <div
          onClick={() => goTo("/dayoff-status-internal")}
          className="p-5 rounded-xl bg-[#0f172a]/60 backdrop-blur-lg border border-white/10 shadow-lg
                     hover:shadow-blue-500/40 hover:border-blue-400/30 hover:bg-[#1e293b]/60
                     transition duration-300 cursor-pointer"
        >
          <div className="text-[11px] uppercase tracking-widest text-blue-300 font-semibold">
            Request Status
          </div>
          <div className="text-xl font-semibold mt-1 text-white">
            Track Status
          </div>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            See if your requests were approved, pending, or returned.
          </p>
        </div>
      </div>

      {/* Announcements */}
      <h2 className="text-lg font-semibold text-white mb-3 tracking-wide">
        Station News & Events
      </h2>

      {loading && (
        <div className="bg-[#0f172a]/60 backdrop-blur-md p-4 rounded-xl border border-white/10 text-sm text-slate-300">
          Loading announcements...
        </div>
      )}

      {!loading && announcements.length === 0 && (
        <div className="bg-[#0f172a]/60 backdrop-blur-md p-4 rounded-xl border border-white/10 text-sm text-slate-300">
          No announcements available.
        </div>
      )}

      {!loading &&
        announcements.map((item) => (
          <div
            key={item.id}
            className="p-5 mb-3 rounded-xl bg-[#0f172a]/60 backdrop-blur-lg border border-white/10 shadow-lg"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-base font-semibold text-white tracking-wide">
                {item.title || "Announcement"}
              </h3>

              {item.createdAt?.toDate && (
                <span className="text-[11px] text-blue-300">
                  {item.createdAt.toDate().toLocaleDateString()}
                </span>
              )}
            </div>

            {item.subtitle && (
              <p className="text-xs text-blue-200 mt-1">{item.subtitle}</p>
            )}

            {item.body && (
              <p className="text-sm text-slate-300 whitespace-pre-line mt-2 leading-relaxed">
                {item.body}
              </p>
            )}
          </div>
        ))}
    </div>
  );
}
