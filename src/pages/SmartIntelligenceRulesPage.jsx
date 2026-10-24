import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

const RULES_COLLECTION = "smart_intelligence_department_rules";

const REPORT_CATALOG = [
  { key: "gate_checklist", label: "Gate Checklist" },
  { key: "operational_report", label: "Supervisor Operational Report" },
  { key: "supervisor_daily_report", label: "Supervisor Daily Report" },
  { key: "timesheet", label: "Timesheet" },
  { key: "operations_request", label: "Supplies / Uniform / OT Request" },
  { key: "cleaning_security", label: "Cleaning & Security Report" },
  { key: "regulated_garbage", label: "Regulated Garbage Report" },
  { key: "wchr_flight_report", label: "WCHR Flight Report" },
  { key: "wchr_poi", label: "WCHR POI Report" },
  { key: "employee_performance", label: "Employee Performance Report" },
  { key: "bso_daily", label: "BSO Daily Report" },
  { key: "fuel_entry", label: "Fuel Entry" },
  { key: "cierre_vuelo", label: "Cierre de Vuelo" },
];

const DEFAULT_DEPARTMENTS = ["SY", "WL", "AV", "WCHR", "DL Cabin Service", "AA BSO"];

function clean(value) {
  return String(value || "").trim();
}

function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function visibleName(user) {
  return user?.displayName || user?.fullName || user?.name || user?.username || "User";
}

function normalizeRule(id, data = {}) {
  return {
    id,
    department: clean(data.department),
    active: data.active !== false,
    reviewMode: data.reviewMode === "DEDICATED" ? "DEDICATED" : "GENERAL_POOL",
    dedicatedDutyManagerIds: Array.isArray(data.dedicatedDutyManagerIds)
      ? data.dedicatedDutyManagerIds.map(String)
      : [],
    requiredReports: Array.isArray(data.requiredReports) ? data.requiredReports.map(String) : [],
    fallbackToStationManager: data.fallbackToStationManager === true,
    fallbackStationManagerId: clean(data.fallbackStationManagerId),
    fallbackStationManagerName: clean(data.fallbackStationManagerName),
    notes: clean(data.notes),
  };
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, boxShadow: "0 12px 30px rgba(15,23,42,.05)", padding: 18, ...style }}>
      {children}
    </div>
  );
}

export default function SmartIntelligenceRulesPage() {
  const { user } = useUser();
  const [rules, setRules] = useState([]);
  const [dutyManagers, setDutyManagers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [newDepartment, setNewDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, RULES_COLLECTION), (snap) => {
      const rows = snap.docs
        .map((d) => normalizeRule(d.id, d.data()))
        .sort((a, b) => a.department.localeCompare(b.department));
      setRules(rows);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let active = true;
    getDocs(collection(db, "users"))
      .then((snap) => {
        if (!active) return;
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((row) => String(row.role || "").toLowerCase() === "duty_manager")
          .sort((a, b) => visibleName(a).localeCompare(visibleName(b)));
        setDutyManagers(rows);
      })
      .catch((error) => {
        console.error("Could not load Duty Managers:", error);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    const current = rules.find((row) => row.id === selectedId);
    setDraft(current ? { ...current, requiredReports: [...current.requiredReports], dedicatedDutyManagerIds: [...current.dedicatedDutyManagerIds] } : null);
  }, [selectedId, rules]);

  const configured = useMemo(() => new Set(rules.map((row) => row.department.toUpperCase())), [rules]);

  const createRule = async (departmentName) => {
    const department = clean(departmentName);
    if (!department) return;
    const id = slug(department);
    if (!id) return;
    setSaving(true);
    setMessage("");
    try {
      await setDoc(doc(db, RULES_COLLECTION, id), {
        department,
        active: true,
        reviewMode: "GENERAL_POOL",
        dedicatedDutyManagerIds: [],
        requiredReports: [],
        fallbackToStationManager: false,
        fallbackStationManagerId: "",
        fallbackStationManagerName: "",
        notes: "",
        createdAt: serverTimestamp(),
        createdById: user?.id || "",
        createdByName: visibleName(user),
        updatedAt: serverTimestamp(),
        updatedById: user?.id || "",
        updatedByName: visibleName(user),
      }, { merge: true });
      setSelectedId(id);
      setNewDepartment("");
      setMessage(`${department} added to Smart Intelligence.`);
    } catch (error) {
      console.error(error);
      setMessage("Could not create department rule.");
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!draft?.id || !draft.department) return;
    setSaving(true);
    setMessage("");
    try {
      await setDoc(doc(db, RULES_COLLECTION, draft.id), {
        department: clean(draft.department),
        active: draft.active !== false,
        reviewMode: draft.reviewMode === "DEDICATED" ? "DEDICATED" : "GENERAL_POOL",
        dedicatedDutyManagerIds: draft.reviewMode === "DEDICATED" ? draft.dedicatedDutyManagerIds : [],
        requiredReports: draft.requiredReports,
        fallbackToStationManager: draft.fallbackToStationManager === true,
        fallbackStationManagerId: draft.fallbackToStationManager ? (user?.id || "") : "",
        fallbackStationManagerName: draft.fallbackToStationManager ? visibleName(user) : "",
        notes: clean(draft.notes),
        updatedAt: serverTimestamp(),
        updatedById: user?.id || "",
        updatedByName: visibleName(user),
      }, { merge: true });
      setMessage(`${draft.department} rules saved.`);
    } catch (error) {
      console.error(error);
      setMessage("Could not save Smart Intelligence rules.");
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async () => {
    if (!draft?.id) return;
    if (!window.confirm(`Remove ${draft.department} from Smart Intelligence rules?`)) return;
    try {
      await deleteDoc(doc(db, RULES_COLLECTION, draft.id));
      setSelectedId("");
      setMessage(`${draft.department} removed.`);
    } catch (error) {
      console.error(error);
      setMessage("Could not remove department rule.");
    }
  };

  const toggleReport = (key) => {
    setDraft((current) => {
      if (!current) return current;
      const set = new Set(current.requiredReports || []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...current, requiredReports: [...set] };
    });
  };

  const toggleDutyManager = (id) => {
    setDraft((current) => {
      if (!current) return current;
      const set = new Set(current.dedicatedDutyManagerIds || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...current, dedicatedDutyManagerIds: [...set] };
    });
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".08em" }}>Smart Intelligence</div>
            <h1 style={{ margin: "4px 0 4px", fontSize: 26, color: "#0f172a" }}>Department Rules</h1>
            <p style={{ margin: 0, color: "#64748b", maxWidth: 760, lineHeight: 1.5 }}>
              Define what each department must submit and who reviews it. Rules stay department-specific so SY, WL, AV, WCHR, Delta and BSO do not get generalized into the same checklist.
            </p>
          </div>
        </div>
      </Card>

      {message && <div style={{ padding: "11px 14px", borderRadius: 12, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af", fontWeight: 700 }}>{message}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, .8fr) minmax(0, 2fr)", gap: 16, alignItems: "start" }}>
        <Card>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Departments</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {rules.map((rule) => (
              <button key={rule.id} type="button" onClick={() => setSelectedId(rule.id)} style={{ textAlign: "left", border: selectedId === rule.id ? "2px solid #2563eb" : "1px solid #dbe4ee", background: selectedId === rule.id ? "#eff6ff" : "#fff", borderRadius: 12, padding: 11, cursor: "pointer" }}>
                <div style={{ fontWeight: 900, color: "#0f172a" }}>{rule.department}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{rule.requiredReports.length} required report{rule.requiredReports.length === 1 ? "" : "s"} · {rule.reviewMode === "DEDICATED" ? "Dedicated Duty Managers" : "General Duty Manager pool"}</div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 14, borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 7 }}>Quick add</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {DEFAULT_DEPARTMENTS.filter((name) => !configured.has(name.toUpperCase())).map((name) => (
                <button key={name} type="button" onClick={() => createRule(name)} disabled={saving} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 9, padding: "7px 9px", cursor: "pointer", fontWeight: 800 }}>{name}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
              <input value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} placeholder="Other department" style={{ minWidth: 0, flex: 1, border: "1px solid #cbd5e1", borderRadius: 9, padding: 9 }} />
              <button type="button" onClick={() => createRule(newDepartment)} disabled={!clean(newDepartment) || saving} style={{ border: 0, background: "#0f4c81", color: "white", borderRadius: 9, padding: "9px 12px", fontWeight: 900, cursor: "pointer" }}>Add</button>
            </div>
          </div>
        </Card>

        <Card>
          {!draft ? (
            <div style={{ color: "#64748b", padding: "24px 4px" }}>Select a department to configure Smart Intelligence.</div>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>Department</div>
                  <input value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} style={{ marginTop: 5, border: "1px solid #cbd5e1", borderRadius: 10, padding: "9px 10px", fontSize: 18, fontWeight: 900, maxWidth: 360, width: "100%" }} />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
                  <input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active
                </label>
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>Who reviews this department?</div>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setDraft({ ...draft, reviewMode: "GENERAL_POOL", dedicatedDutyManagerIds: [] })} style={{ border: draft.reviewMode === "GENERAL_POOL" ? "2px solid #2563eb" : "1px solid #cbd5e1", background: draft.reviewMode === "GENERAL_POOL" ? "#eff6ff" : "#fff", borderRadius: 10, padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>General Duty Manager Pool</button>
                  <button type="button" onClick={() => setDraft({ ...draft, reviewMode: "DEDICATED" })} style={{ border: draft.reviewMode === "DEDICATED" ? "2px solid #2563eb" : "1px solid #cbd5e1", background: draft.reviewMode === "DEDICATED" ? "#eff6ff" : "#fff", borderRadius: 10, padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Dedicated Duty Managers</button>
                </div>
              </div>

              <div style={{ border: "1px solid #dbeafe", background: draft.fallbackToStationManager ? "#eff6ff" : "#f8fafc", borderRadius: 12, padding: 12 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={draft.fallbackToStationManager === true}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        fallbackToStationManager: e.target.checked,
                        fallbackStationManagerId: e.target.checked ? (user?.id || "") : "",
                        fallbackStationManagerName: e.target.checked ? visibleName(user) : "",
                      })
                    }
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>Assign to me if no eligible Duty Manager is active</strong><br/>
                    <span style={{ fontSize: 11.5, color: "#64748b" }}>
                      Smart Intelligence will assign this department to {visibleName(user)} as Station Manager fallback instead of leaving it WAITING.
                    </span>
                  </span>
                </label>
              </div>

              {draft.reviewMode === "DEDICATED" && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>Dedicated Duty Managers</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                    {dutyManagers.map((dm) => {
                      const checked = draft.dedicatedDutyManagerIds.includes(dm.id);
                      return (
                        <label key={dm.id} style={{ display: "flex", gap: 9, alignItems: "center", border: checked ? "2px solid #2563eb" : "1px solid #e2e8f0", background: checked ? "#eff6ff" : "#fff", borderRadius: 10, padding: 10, cursor: "pointer" }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleDutyManager(dm.id)} />
                          <span><strong>{visibleName(dm)}</strong><br/><span style={{ fontSize: 11, color: "#64748b" }}>{dm.department || dm.position || "Duty Manager"}</span></span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>Required reports</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
                  {REPORT_CATALOG.map((report) => {
                    const checked = draft.requiredReports.includes(report.key);
                    return (
                      <label key={report.key} style={{ display: "flex", gap: 9, alignItems: "center", border: checked ? "2px solid #22c55e" : "1px solid #e2e8f0", background: checked ? "#f0fdf4" : "#fff", borderRadius: 10, padding: 10, cursor: "pointer" }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleReport(report.key)} />
                        <span style={{ fontWeight: 800 }}>{report.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>Notes / special rules</div>
                <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Example: Gate Checklist may be submitted by Gate Controller; Miguel Quevedo remains responsible for SY completion." rows={4} style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, resize: "vertical" }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={deleteRule} style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#be123c", borderRadius: 10, padding: "9px 12px", fontWeight: 900, cursor: "pointer" }}>Remove Department</button>
                <button type="button" onClick={saveDraft} disabled={saving} style={{ border: 0, background: "#0f4c81", color: "white", borderRadius: 10, padding: "10px 16px", fontWeight: 900, cursor: "pointer" }}>{saving ? "Saving..." : "Save Smart Rules"}</button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
