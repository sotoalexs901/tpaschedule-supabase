// src/hooks/useActiveDispatchBoard.js
// READ-ONLY bridge for the future Live Service Board.
// Uses active WCHR shifts as the source of truth, preventing old reports
// from appearing as current assignments. No Firebase writes.
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { umnrRequest } from "../utils/umnrClient.js";

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
    .filter((report) => !["STORED", "CANCELLED", "COMPLETED", "CLOSED", "DELIVERED", "BOARDED"].some(
      (state) => state === upper(report.tracking_status) || state === upper(report.service_status)
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
        board_agent_id: clean(shift.id),
        board_live_tracking_consent: shift.live_tracking_consent === true,
        board_live_gps: shift.live_tracking_consent === true ? shift.live_gps || null : null,
        board_shift_status: clean(shift.status),
      };
    });
}

export function selectPendingWchrBoardReports(reports = [], shifts = []) {
  const activeIds = new Set(selectActiveWchrBoardReports(reports, shifts).map((r) => clean(r.id)));
  const terminal = new Set(["STORED", "CANCELLED", "COMPLETED", "CLOSED", "DELIVERED", "BOARDED", "PENDING_STORAGE", "AT_GATE", "BOARDING", "IN_TRANSIT", "PICKED_UP"]);
  const today = new Date();
  const localDay = (value) => {
    if (!value) return null;
    if (typeof value?.toDate === "function") return value.toDate().toLocaleDateString("en-CA");
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString("en-CA");
  };
  return reports.filter((r) => {
    if (!r || activeIds.has(clean(r.id))) return false;
    const state = upper(r.tracking_status || r.service_status);
    if (terminal.has(state)) return false;
    const assignment = upper(r.assignment_status);
    if (!["UNASSIGNED", "READY_FOR_ASSIGNMENT", "NEW"].includes(assignment) && !["NEW", "READY_FOR_PICKUP", "READY_FOR_ASSIGNMENT"].includes(state)) return false;
    if (clean(r.wchr_agent_id || r.assigned_agent_id || r.wchr_agent_name || r.assigned_wchr_agent)) return false;
    const date = localDay(r.flight_date || r.flightDate || r.service_date || r.created_at);
    if (!date || date !== today.toLocaleDateString("en-CA")) return false;
    return Boolean(clean(r.id)) && Boolean(clean(r.flight_number || r.flightNumber));
  });
}

export default function useActiveDispatchBoard() {
  const [reports, setReports] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [ready, setReady] = useState({ reports: false, shifts: false });
  const [error, setError] = useState("");
  const [umnrAssignments, setUmnrAssignments] = useState([]);
  const [umnrError, setUmnrError] = useState("");

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

  // UMNR is server-authorized; never subscribe to protected Firestore records directly.
  // Failure of UMNR authorization must not interrupt the existing WCHR board.
  useEffect(() => {
    if (import.meta.env.VITE_UMNR_ENABLED !== "true") return;
    let mounted = true;
    let inFlight = false;
    const loadUmnr = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await umnrRequest("list");
        if (mounted) {
          setUmnrAssignments(Array.isArray(result.items) ? result.items : []);
          setUmnrError("");
        }
      } catch (err) {
        if (mounted) {
          setUmnrAssignments([]); // Never display stale assignment data.
          setUmnrError("UMNR Live Board unavailable. Review UMNR Dispatch for current status.");
        }
      } finally {
        inFlight = false;
      }
    };
    loadUmnr();
    const interval = window.setInterval(loadUmnr, 15000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);

  const wchrReports = useMemo(() => selectActiveWchrBoardReports(reports, shifts), [reports, shifts]);
  const pendingWchrReports = useMemo(() => selectPendingWchrBoardReports(reports, shifts), [reports, shifts]);
  return { wchrReports, pendingWchrReports, umnrAssignments, loading: !ready.reports || !ready.shifts, error, umnrError };
}
