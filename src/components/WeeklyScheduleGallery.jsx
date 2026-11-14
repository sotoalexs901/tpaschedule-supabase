import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Dashboard photo gallery. Only approved schedules with a published image
 * are eligible. Existing My Schedule and schedule approval remain untouched.
 */
export default function WeeklyScheduleGallery() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const snapshot = await getDocs(query(collection(db, "schedules"), where("status", "==", "approved")));
        if (!active) return;
        setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        if (active) setError("Weekly schedule photos are temporarily unavailable.");
        console.error("Schedule gallery:", err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const gallery = useMemo(() => {
    const entries = schedules
      .filter(item => item.published === true && (item.scheduleImageUrl || item.weeklyScheduleImageUrl))
      .map(item => ({
        id: item.id,
        department: item.department || item.airlineDisplayName || item.airline || "Department",
        week: String(item.weekStart || item.weekTag || ""),
        url: item.scheduleImageUrl || item.weeklyScheduleImageUrl,
        updated: item.publishedAt?.toDate?.()?.getTime?.() || item.approvedAt?.toDate?.()?.getTime?.() || 0,
      }))
      .sort((a, b) => b.week.localeCompare(a.week) || b.updated - a.updated);
    const latestWeek = entries[0]?.week;
    const byDepartment = new Map();
    for (const entry of entries) {
      if (entry.week !== latestWeek) continue;
      if (!byDepartment.has(entry.department)) byDepartment.set(entry.department, entry);
    }
    return [...byDepartment.values()].sort((a, b) => a.department.localeCompare(b.department));
  }, [schedules]);

  useEffect(() => { setIndex(0); }, [gallery.length]);
  const current = gallery[Math.min(index, gallery.length - 1)];
  const move = delta => setIndex(i => (i + delta + gallery.length) % gallery.length);

  return (
    <section id="weekly-schedules" aria-label="Weekly Department Schedules" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 14, minWidth: 0 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "#0f172a" }}>Weekly Department Schedules</h2>
      {loading ? <p role="status">Loading approved schedules...</p> :
        error ? <p role="alert">{error}</p> :
        !current ? <p style={{ color: "#64748b", fontSize: 13 }}>No approved weekly schedule photos have been published yet. Your personal schedule remains available in My Schedule.</p> :
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <strong>{current.department}</strong><span style={{ color: "#64748b", fontSize: 12 }}>Week: {current.week} · {index + 1} of {gallery.length}</span>
          </div>
          <button type="button" onClick={() => move(1)} aria-label="View next department schedule" title="Tap to see the next department" style={{ width: "100%", padding: 0, border: 0, background: "transparent", cursor: "pointer" }}>
            <img src={current.url} alt={`Approved weekly schedule for ${current.department}, week ${current.week}`} style={{ width: "100%", maxHeight: 480, objectFit: "contain", borderRadius: 10, border: "1px solid #e2e8f0" }} />
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => move(-1)}>Previous</button>
            <button type="button" onClick={() => setExpanded(true)}>Enlarge photo</button>
            <button type="button" onClick={() => move(1)}>Next</button>
          </div>
          {expanded && <div role="dialog" aria-modal="true" aria-label={`Expanded schedule: ${current.department}`} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,.9)", padding: 12, overflow: "auto" }}>
            <button type="button" onClick={() => setExpanded(false)} style={{ position: "sticky", top: 0, zIndex: 1, padding: 12 }}>Close</button>
            <img src={current.url} alt={`Full schedule for ${current.department}`} style={{ display: "block", maxWidth: "none", width: "max(100%, 900px)", height: "auto", margin: "12px auto" }} />
          </div>}
        </>}
    </section>
  );
}
