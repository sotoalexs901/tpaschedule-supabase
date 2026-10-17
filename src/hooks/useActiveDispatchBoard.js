// src/hooks/useActiveDispatchBoard.js
// READ-ONLY bridge for the future Live Service Board.
// Uses active WCHR shifts as the source of truth, preventing old reports
// from appearing as current assignments. No Firebase writes.
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

export function selectActiveWchrBoardReports(reports = [], shifts = []) {
  const activeShifts = new Map();
  for (const shift of shifts) {
    if (upper(shift?.status) !== "ACTIVE") continue;
    const reportId = clean(shift?.active_report_id);
    if (!reportId) continue;
    activeShifts.set(reportId, shift);
  }
  return reports
    .filter((report) => report && activeShifts.has(clean(report.id)))
    .filter((report) => !["STORED", "CANCELLED", "COMPLETED", "CLOSED"].includes(
      upper(report.tracking_status || report.service_status)
    ))
    .map((report) => {
      const shift = activeShifts.get(clean(report.id));
      return {
        ...report,
        // Shift location is the latest employee location; do not overwrite
        // passenger journey location in Firestore.
        board_agent_location: clean(shift.current_location),
        board_agent_name: clean(shift.agent_name),
        board_availability: clean(shift.availability_status),
      };
    });
}

export default function useActiveDispatchBoard() {
  const [reports, setReports] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [ready, setReady] = useState({ reports: false, shifts: false });
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubReports = onSnapshot(collection(db, "wch_reports"), (snapshot) => {
      setReports(snapshot.docs.map((d) => ({ ...d.data(), id: d.id })));
      setReady((prev) => ({ ...prev, reports: true }));
    }, () => setError("Unable to load WCHR reports for Live Board."));
    const unsubShifts = onSnapshot(collection(db, "wchr_agent_shifts"), (snapshot) => {
      setShifts(snapshot.docs.map((d) => ({ ...d.data(), id: d.id })));
      setReady((prev) => ({ ...prev, shifts: true }));
    }, () => setError("Unable to load active agent shifts for Live Board."));
    return () => { unsubReports(); unsubShifts(); };
  }, []);

  const wchrReports = useMemo(() => selectActiveWchrBoardReports(reports, shifts), [reports, shifts]);
  return { wchrReports, umnrAssignments: [], loading: !ready.reports || !ready.shifts, error };
}
