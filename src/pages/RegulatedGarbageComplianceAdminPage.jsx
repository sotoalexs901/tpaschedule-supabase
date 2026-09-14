import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  doc,
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from "firebase/storage";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

const DOCUMENTS_COLLECTION = "regulated_garbage_compliance_documents";
const storage = getStorage();

function safeName(name) {
  return String(name || "document.pdf")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
}

function visibleUserName(user) {
  return user?.displayName || user?.fullName || user?.name || user?.username || "Management";
}

export default function RegulatedGarbageComplianceAdminPage() {
  const { user } = useUser();
  const canManage = user?.role === "duty_manager" || user?.role === "station_manager";

  const [rows, setRows] = useState([]);
  const [documentType, setDocumentType] = useState("employee_training_record");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const requiresYear = documentType === "employee_training_record";

  async function loadRows() {
    const snap = await getDocs(
      query(collection(db, DOCUMENTS_COLLECTION), orderBy("uploadedAt", "desc"))
    );
    setRows(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
  }

  useEffect(() => {
    if (!canManage) return;
    loadRows().catch((loadError) => {
      console.error("Compliance documents load error:", loadError);
      setError(loadError?.message || "Could not load compliance documents.");
    });
  }, [canManage]);

  const activeRows = useMemo(() => rows.filter((row) => row.archived !== true), [rows]);

  async function archiveExistingCurrentDocs(type) {
    if (type === "employee_training_record") return;

    const current = rows.filter(
      (row) => row.documentType === type && row.archived !== true && row.active !== false
    );

    await Promise.all(
      current.map((row) =>
        updateDoc(doc(db, DOCUMENTS_COLLECTION, row.id), {
          active: false,
          archived: true,
          archivedAt: serverTimestamp(),
          archivedBy: visibleUserName(user),
        })
      )
    );
  }

  async function handleUpload(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!file) {
      setError("Select a PDF file.");
      return;
    }

    if (file.type && file.type !== "application/pdf") {
      setError("Compliance documents must be uploaded as PDF files.");
      return;
    }

    if (requiresYear && !/^\d{4}$/.test(String(year))) {
      setError("Enter a valid four-digit training year.");
      return;
    }

    try {
      setSaving(true);

      await archiveExistingCurrentDocs(documentType);

      const folder =
        documentType === "employee_training_record"
          ? `employee-training/${year}`
          : documentType;

      const path = `regulated-garbage/compliance/${folder}/${Date.now()}-${safeName(file.name)}`;
      const fileRef = storageRef(storage, path);

      await uploadBytes(fileRef, file, {
        contentType: file.type || "application/pdf",
      });

      const fileUrl = await getDownloadURL(fileRef);

      await addDoc(collection(db, DOCUMENTS_COLLECTION), {
        documentType,
        year: requiresYear ? Number(year) : null,
        title: String(title || "").trim() || file.name,
        version: String(version || "").trim(),
        effectiveDate: effectiveDate || "",
        fileName: file.name,
        fileUrl,
        storagePath: path,
        active: true,
        archived: false,
        uploadedByUserId: user?.id || "",
        uploadedByUsername: user?.username || "",
        uploadedByName: visibleUserName(user),
        uploadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setTitle("");
      setVersion("");
      setEffectiveDate("");
      setFile(null);
      const input = document.getElementById("regulated-garbage-compliance-file");
      if (input) input.value = "";

      await loadRows();
      setMessage("Compliance document uploaded successfully.");
    } catch (uploadError) {
      console.error("Compliance document upload error:", uploadError);
      setError(uploadError?.message || "Could not upload compliance document.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveDocument(row) {
    try {
      setMessage("");
      setError("");
      await updateDoc(doc(db, DOCUMENTS_COLLECTION, row.id), {
        active: false,
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: visibleUserName(user),
        updatedAt: serverTimestamp(),
      });
      await loadRows();
      setMessage("Document archived.");
    } catch (archiveError) {
      console.error("Compliance archive error:", archiveError);
      setError(archiveError?.message || "Could not archive document.");
    }
  }

  if (!canManage) {
    return <div style={{ padding: 20 }}>Only Duty Managers and Station Managers can manage compliance documents.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div
        style={{
          borderRadius: 26,
          padding: 24,
          color: "#fff",
          background: "linear-gradient(135deg, #0f4c81 0%, #1769aa 58%, #5aa9e6 100%)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", opacity: 0.8 }}>
          REGULATED GARBAGE Â· MANAGEMENT
        </div>
        <h1 style={{ margin: "8px 0 5px", fontSize: 30 }}>Compliance Documents Management</h1>
        <p style={{ margin: 0, opacity: 0.9 }}>
          Upload Employee Training Records, the current company Training Program, and the current USDA Monitoring Checklist.
        </p>
      </div>

      {(message || error) && (
        <div
          style={{
            padding: 14,
            borderRadius: 14,
            background: error ? "#fff1f2" : "#ecfdf5",
            border: error ? "1px solid #fecaca" : "1px solid #bbf7d0",
            color: error ? "#b91c1c" : "#166534",
            fontWeight: 750,
          }}
        >
          {error || message}
        </div>
      )}

      <form
        onSubmit={handleUpload}
        style={{
          display: "grid",
          gap: 14,
          padding: 20,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 20,
        }}
      >
        <div style={{ fontSize: 19, fontWeight: 900, color: "#0f172a" }}>Upload Compliance Document</div>

        <label style={{ display: "grid", gap: 6, fontWeight: 750, color: "#475569" }}>
          Document Type
          <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} style={inputStyle}>
            <option value="employee_training_record">Employee Training Record</option>
            <option value="training_program">Regulated Garbage Training Program</option>
            <option value="usda_monitoring_checklist">USDA Monitoring Checklist</option>
          </select>
        </label>

        {requiresYear && (
          <label style={{ display: "grid", gap: 6, fontWeight: 750, color: "#475569" }}>
            Training Year
            <input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} style={inputStyle} />
          </label>
        )}

        <label style={{ display: "grid", gap: 6, fontWeight: 750, color: "#475569" }}>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Document title" style={inputStyle} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontWeight: 750, color: "#475569" }}>
            Version (optional)
            <input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="e.g. Rev 2026-01" style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 6, fontWeight: 750, color: "#475569" }}>
            Effective Date (optional)
            <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} style={inputStyle} />
          </label>
        </div>

        <label style={{ display: "grid", gap: 6, fontWeight: 750, color: "#475569" }}>
          PDF File
          <input id="regulated-garbage-compliance-file" type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} style={inputStyle} />
        </label>

        <button
          type="submit"
          disabled={saving}
          style={{
            justifySelf: "start",
            border: "none",
            borderRadius: 12,
            padding: "11px 16px",
            background: "#1769aa",
            color: "#fff",
            fontWeight: 850,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Uploading..." : "Upload Document"}
        </button>
      </form>

      <div style={{ padding: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: "#0f172a", marginBottom: 12 }}>Current Documents</div>
        {activeRows.length === 0 ? (
          <div style={{ color: "#64748b" }}>No compliance documents uploaded yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            {activeRows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: 13,
                  border: "1px solid #e2e8f0",
                  borderRadius: 14,
                }}
              >
                <div>
                  <div style={{ fontWeight: 850, color: "#0f172a" }}>{row.title || row.fileName || "Document"}</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: "#64748b" }}>
                    {row.documentType}{row.year ? ` Â· ${row.year}` : ""}{row.version ? ` Â· ${row.version}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {row.fileUrl && (
                    <a href={row.fileUrl} target="_blank" rel="noreferrer" style={linkButtonStyle}>View</a>
                  )}
                  <button type="button" onClick={() => archiveDocument(row)} style={archiveButtonStyle}>Archive</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "11px 12px",
  background: "#fff",
  color: "#0f172a",
  fontFamily: "inherit",
};

const linkButtonStyle = {
  display: "inline-flex",
  textDecoration: "none",
  borderRadius: 10,
  padding: "8px 11px",
  background: "#edf7ff",
  border: "1px solid #cfe7fb",
  color: "#1769aa",
  fontWeight: 800,
  fontSize: 12,
};

const archiveButtonStyle = {
  borderRadius: 10,
  padding: "8px 11px",
  background: "#fff7ed",
  border: "1px solid #fdba74",
  color: "#9a3412",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
};
