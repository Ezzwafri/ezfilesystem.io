import { useState, useEffect, useCallback } from "react";
import { supabase, createDetachedClient } from "./supabaseClient";

const FILE_STATUSES = ["Searching", "Found", "Pending Delivery", "Delivered"];
const PAY_STATUSES = ["Pending", "Billing", "Billed", "Pending Payment", "Payed"];
const STATUS_COLORS = {
  Pending: "#f59e0b", Searching: "#3b82f6", Found: "#10b981",
  "Pending Delivery": "#f97316", Delivered: "#059669",
  Billing: "#8b5cf6", Billed: "#6366f1", "Pending Payment": "#f97316", Payed: "#10b981",
  Request: "#ec4899",
};

function genPassword() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  return Array.from({ length: 10 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}
function ts() { return new Date().toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }); }

function mapFile(row) {
  return {
    id: row.id, clientName: row.client_name, caseReference: row.case_reference,
    boxReference: row.box_reference, status: row.status, paymentStatus: row.payment_status,
    remarks: row.remarks, logs: row.logs || [], requestedBy: row.requested_by,
    requestedByName: row.requested_by_name, createdAt: row.created_at, createdBy: row.created_by,
  };
}
function mapRequest(row) {
  return {
    id: row.id, caseReference: row.case_reference, clientName: row.client_name,
    useType: row.use_type, status: row.status, requestedBy: row.requested_by,
    requestedByName: row.requested_by_name, requestedAt: row.requested_at,
  };
}

function normalizeRef(s) { return (s || "").trim().toLowerCase(); }
function activeRequestFor(file, requests) {
  return requests.find(r => r.status !== "Delivered" && normalizeRef(r.caseReference) === normalizeRef(file.caseReference)) || null;
}
function findFileByCaseRef(caseRef, files) {
  return files.find(f => normalizeRef(f.caseReference) === normalizeRef(caseRef)) || null;
}
function requestDisplayStatus(request, files) {
  const file = findFileByCaseRef(request.caseReference, files);
  return (file && file.status) || "Request";
}

const Badge = ({ text, color }) => (
  <span style={{ background: color || "#94a3b8", color: "#fff", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{text}</span>
);

const Btn = ({ children, onClick, variant = "primary", style = {}, disabled }) => {
  const base = { border: "none", borderRadius: 6, padding: "8px 18px", cursor: disabled ? "default" : "pointer", fontWeight: 600, fontSize: 13, opacity: disabled ? 0.5 : 1, transition: "all .15s" };
  const vars = {
    primary: { background: "#1e3a5f", color: "#fff" },
    secondary: { background: "#e2e8f0", color: "#334155" },
    danger: { background: "#dc2626", color: "#fff" },
    success: { background: "#059669", color: "#fff" },
    ghost: { background: "transparent", color: "#1e3a5f", textDecoration: "underline" },
  };
  return <button style={{ ...base, ...vars[variant], ...style }} onClick={onClick} disabled={disabled}>{children}</button>;
};

const Input = ({ label, ...props }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{label}</label>}
    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} {...props} />
  </div>
);

const Select = ({ label, options, ...props }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{label}</label>}
    <select style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} {...props}>
      {options.map(o => {
        const value = typeof o === "string" ? o : o.value;
        const text = typeof o === "string" ? o : o.label;
        return <option key={value} value={value}>{text}</option>;
      })}
    </select>
  </div>
);

const Card = ({ children, style = {} }) => (
  <div style={{ background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.08)", ...style }}>{children}</div>
);

const Modal = ({ title, onClose, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
    <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 500, width: "100%", maxHeight: "85vh", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: "#1e293b" }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const Tabs = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 20 }}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)} style={{
        padding: "10px 20px", border: "none", borderBottom: active === t.id ? "2px solid #1e3a5f" : "2px solid transparent",
        marginBottom: -2, background: "none", color: active === t.id ? "#1e3a5f" : "#94a3b8",
        fontWeight: active === t.id ? 700 : 500, cursor: "pointer", fontSize: 14,
      }}>
        {t.label}{t.count != null && t.count > 0 ? <span style={{ background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 7px", marginLeft: 6, fontSize: 11 }}>{t.count}</span> : null}
      </button>
    ))}
  </div>
);

function FileTable({ files, requests, onView, onDelete }) {
  return (
    <Card style={{ padding: 0, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
            <th style={{ padding: "10px 12px", color: "#64748b", fontSize: 12, fontWeight: 600 }}>CLIENT / CASE</th>
            <th style={{ padding: "10px 12px", color: "#64748b", fontSize: 12, fontWeight: 600 }}>BOX REF</th>
            <th style={{ padding: "10px 12px", color: "#64748b", fontSize: 12, fontWeight: 600 }}>STATUS</th>
            <th style={{ padding: "10px 12px", color: "#64748b", fontSize: 12, fontWeight: 600 }}>PAYMENT STATUS</th>
            <th style={{ padding: "10px 12px", color: "#64748b", fontSize: 12, fontWeight: 600 }}>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {files.map(f => {
            const activeReq = activeRequestFor(f, requests);
            const displayStatus = f.status || (activeReq ? "Request" : null);
            return (
              <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "12px" }}>
                  <div style={{ fontWeight: 600, color: "#1e293b" }}>{f.clientName}</div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>Case: {f.caseReference}</div>
                  {activeReq && <div style={{ fontSize: 12, color: "#94a3b8" }}>Requested by {activeReq.requestedByName}</div>}
                </td>
                <td style={{ padding: "12px", color: "#475569", fontSize: 14 }}>{f.boxReference}</td>
                <td style={{ padding: "12px" }}><Badge text={displayStatus || "No Status"} color={STATUS_COLORS[displayStatus] || "#94a3b8"} /></td>
                <td style={{ padding: "12px" }}><Badge text={f.paymentStatus || "No Status"} color={STATUS_COLORS[f.paymentStatus] || "#94a3b8"} /></td>
                <td style={{ padding: "12px" }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Btn variant="secondary" onClick={() => onView(f)} style={{ padding: "4px 10px", fontSize: 12 }}>View</Btn>
                    {onDelete && <Btn variant="danger" onClick={() => onDelete(f)} style={{ padding: "4px 10px", fontSize: 12 }}>Delete</Btn>}
                  </div>
                </td>
              </tr>
            );
          })}
          {files.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>No files found</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function FileEditModal({ file, remark, setRemark, onClose, updateFileField, addRemark, onDelete, onClearRequester }) {
  return (
    <Modal title="File Details — Edit" onClose={onClose}>
      <div style={{ display: "grid", gap: 14 }}>
        <div><span style={{ fontSize: 12, color: "#64748b" }}>Client Name</span><div style={{ fontWeight: 600, fontSize: 16 }}>{file.clientName}</div></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><span style={{ fontSize: 12, color: "#64748b" }}>Case Reference</span><div style={{ fontWeight: 500 }}>{file.caseReference}</div></div>
          <div><span style={{ fontSize: 12, color: "#64748b" }}>Box Reference</span><div style={{ fontWeight: 500 }}>{file.boxReference}</div></div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: "#64748b" }}>Requested By</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 500 }}>{file.requestedByName || "—"}</div>
            {onClearRequester && file.requestedByName && (
              <Btn variant="secondary" onClick={() => onClearRequester(file.id)} style={{ padding: "2px 8px", fontSize: 11 }}>Clear</Btn>
            )}
          </div>
        </div>
        <Select label="File Status" value={file.status || ""} onChange={e => updateFileField(file, "status", e.target.value)} options={[{ value: "", label: "— Select Status —" }, ...FILE_STATUSES]} />
        <Select label="Payment Status" value={file.paymentStatus || ""} onChange={e => updateFileField(file, "paymentStatus", e.target.value)} options={[{ value: "", label: "— Select Payment Status —" }, ...PAY_STATUSES]} />
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Remarks</label>
          <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={3}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
          <Btn variant="secondary" onClick={() => addRemark(file, remark)} style={{ marginTop: 6 }}>Save Remark</Btn>
        </div>
        {file.logs && file.logs.length > 0 && (
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Log History</span>
            <div style={{ background: "#f8fafc", borderRadius: 6, padding: 10, maxHeight: 200, overflow: "auto", marginTop: 4 }}>
              {file.logs.slice().reverse().map((l, i) => (
                <div key={i} style={{ fontSize: 13, padding: "6px 0", borderBottom: i < file.logs.length - 1 ? "1px solid #e2e8f0" : "none" }}>
                  <div style={{ color: "#94a3b8", fontSize: 11 }}>{l.time} — <span style={{ color: "#64748b" }}>{l.by}</span></div>
                  <div style={{ color: "#334155" }}>{l.action}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {onDelete && <Btn variant="danger" onClick={() => onDelete(file)} style={{ marginTop: 4 }}>Delete File</Btn>}
      </div>
    </Modal>
  );
}

function FileViewModal({ file, onClose }) {
  return (
    <Modal title="File Details" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div><span style={{ fontSize: 12, color: "#64748b" }}>Client Name</span><div style={{ fontWeight: 600 }}>{file.clientName}</div></div>
        <div><span style={{ fontSize: 12, color: "#64748b" }}>Case Reference</span><div style={{ fontWeight: 600 }}>{file.caseReference}</div></div>
        <div><span style={{ fontSize: 12, color: "#64748b" }}>Box Reference</span><div style={{ fontWeight: 600 }}>{file.boxReference}</div></div>
        <div><span style={{ fontSize: 12, color: "#64748b" }}>Requested By</span><div style={{ fontWeight: 600 }}>{file.requestedByName || "—"}</div></div>
        <div><span style={{ fontSize: 12, color: "#64748b" }}>Remarks</span><div style={{ background: "#f8fafc", padding: 10, borderRadius: 6, minHeight: 40, fontSize: 14 }}>{file.remarks || "No remarks"}</div></div>
        {file.logs && file.logs.length > 0 && (
          <div>
            <span style={{ fontSize: 12, color: "#64748b" }}>Log History</span>
            <div style={{ background: "#f8fafc", borderRadius: 6, padding: 10, maxHeight: 160, overflow: "auto" }}>
              {file.logs.map((l, i) => (
                <div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: i < file.logs.length - 1 ? "1px solid #e2e8f0" : "none" }}>
                  <span style={{ color: "#94a3b8", fontSize: 11 }}>{l.time}</span> — <span style={{ color: "#475569" }}>{l.action}</span>
                  <span style={{ color: "#94a3b8" }}> by {l.by}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [files, setFiles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [booting, setBooting] = useState(true);
  const [toast, setToast] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const fetchFiles = useCallback(async () => {
    const { data } = await supabase.from("files").select("*").order("created_at", { ascending: false });
    setFiles((data || []).map(mapFile));
  }, []);
  const fetchRequests = useCallback(async () => {
    const { data } = await supabase.from("requests").select("*").order("requested_at", { ascending: false });
    setRequests((data || []).map(mapRequest));
  }, []);
  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    setProfiles(data || []);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); setBooting(false); return; }
    (async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (error || !data || data.disabled) {
        if (data && data.disabled) showToast("This account has been deactivated");
        await supabase.auth.signOut();
        setProfile(null);
        setBooting(false);
        return;
      }
      setProfile(data);
    })();
  }, [session]);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      await Promise.all([fetchProfiles(), fetchFiles(), fetchRequests()]);
      if (!cancelled) setBooting(false);
    })();
    const channel = supabase
      .channel("efs-db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "files" }, fetchFiles)
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, fetchRequests)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchProfiles)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [profile, fetchProfiles, fetchFiles, fetchRequests]);

  const logout = () => supabase.auth.signOut();

  const addMember = async ({ email, name, role }) => {
    if (profiles.find(p => p.email === email)) throw new Error("Email already exists");
    const password = genPassword();
    const temp = createDetachedClient();
    const { data, error } = await temp.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    const uid = data.user?.id;
    if (!uid) throw new Error("Could not create account");
    const { error: insertError } = await supabase.from("profiles").insert({ id: uid, email, name, role, disabled: false });
    if (insertError) throw new Error(insertError.message);
    await fetchProfiles();
    return password;
  };

  const resetMemberPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) throw new Error(error.message);
  };

  const setMemberDisabled = async (uid, disabled) => {
    const { error } = await supabase.from("profiles").update({ disabled }).eq("id", uid);
    if (error) return showToast(error.message);
    await fetchProfiles();
    showToast(disabled ? "Member deactivated" : "Member reactivated");
  };

  const renameMember = async (uid, name) => {
    const { error } = await supabase.from("profiles").update({ name }).eq("id", uid);
    if (error) return showToast(error.message);
    await fetchProfiles();
    showToast("Name updated");
  };

  const changeMyPassword = async (currentPw, newPw) => {
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: profile.email, password: currentPw });
    if (verifyError) throw new Error("Current password is incorrect");
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) throw new Error(error.message);
  };

  const addFile = async ({ clientName, caseRef, boxRef }) => {
    const matchingRequest = requests.find(r => normalizeRef(r.caseReference) === normalizeRef(caseRef));
    const { data, error } = await supabase.from("files").insert({
      client_name: clientName, case_reference: caseRef, box_reference: boxRef,
      remarks: "",
      logs: [{ time: ts(), action: "File added to system", by: profile.name }],
      created_by: profile.name,
      ...(matchingRequest ? { requested_by: matchingRequest.requestedBy, requested_by_name: matchingRequest.requestedByName } : {}),
    }).select().single();
    if (error) throw new Error(error.message);
    await fetchFiles();
    return mapFile(data);
  };

  const clearFileRequester = async (fileId) => {
    const { error } = await supabase.from("files").update({ requested_by: null, requested_by_name: null }).eq("id", fileId);
    if (error) return showToast(error.message);
    await fetchFiles();
    showToast("Requested By cleared");
  };

  const deleteFile = async (file) => {
    const { error } = await supabase.from("files").delete().eq("id", file.id);
    if (error) return showToast(error.message);
    const linkedRequests = requests.filter(r => normalizeRef(r.caseReference) === normalizeRef(file.caseReference));
    if (linkedRequests.length > 0) {
      await supabase.from("requests").delete().in("id", linkedRequests.map(r => r.id));
    }
    await Promise.all([fetchFiles(), fetchRequests()]);
    showToast("File deleted");
  };

  const updateFileField = async (file, field, value) => {
    const dbField = field === "paymentStatus" ? "payment_status" : field;
    const log = { time: ts(), action: `${field} changed to "${value}"`, by: profile.name };
    const { error } = await supabase.from("files").update({ [dbField]: value, logs: [...(file.logs || []), log] }).eq("id", file.id);
    if (error) return showToast(error.message);
    if (field === "status" && value === "Delivered") {
      const openRequests = requests.filter(r => r.status !== "Delivered" && normalizeRef(r.caseReference) === normalizeRef(file.caseReference));
      if (openRequests.length > 0) {
        await supabase.from("requests").update({ status: "Delivered" }).in("id", openRequests.map(r => r.id));
      }
    }
    await Promise.all([fetchFiles(), fetchRequests()]);
    showToast(`${field} updated`);
  };

  const addRemark = async (file, remarkText) => {
    if (!remarkText.trim()) return;
    const log = { time: ts(), action: `Remark added: "${remarkText.trim()}"`, by: profile.name };
    const { error } = await supabase.from("files").update({ remarks: remarkText.trim(), logs: [...(file.logs || []), log] }).eq("id", file.id);
    if (error) return showToast(error.message);
    await fetchFiles();
    showToast("Remark added");
  };

  const submitRequest = async ({ caseRef, clientName, useType }) => {
    const { error } = await supabase.from("requests").insert({
      case_reference: caseRef, client_name: clientName, use_type: useType,
      status: "Pending", requested_by: profile.id, requested_by_name: profile.name,
    });
    if (error) throw new Error(error.message);
    const matchingFile = findFileByCaseRef(caseRef, files);
    if (matchingFile) {
      const { error: rpcError } = await supabase.rpc("set_file_requester", { p_case_reference: caseRef, p_requested_by: profile.id, p_requested_by_name: profile.name });
      if (rpcError) showToast(`Request saved, but couldn't tag the file: ${rpcError.message}`);
    }
    await Promise.all([fetchRequests(), fetchFiles()]);
  };

  if (booting) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#64748b" }}>Loading...</div>;

  if (recoveryMode) return <ResetPasswordScreen onDone={() => setRecoveryMode(false)} showToast={showToast} toast={toast} />;

  if (!profile) return <LoginScreen showToast={showToast} toast={toast} />;

  const shell = (content) => (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100vh", background: "#f1f5f9" }}>
      <header style={{ background: "linear-gradient(135deg, #0f2942 0%, #1e3a5f 100%)", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#c9a227", color: "#0f2942", fontWeight: 800, width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>E</div>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>EZRI FILE SYSTEM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#cbd5e1", fontSize: 13 }}>{profile.name} <Badge text={profile.role.toUpperCase()} color={profile.role === "admin" ? "#c9a227" : profile.role === "pic" ? "#3b82f6" : "#059669"} /></span>
          <Btn variant="ghost" onClick={logout} style={{ color: "#94a3b8", fontSize: 12 }}>Logout</Btn>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        {content}
      </main>
      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", padding: "10px 24px", borderRadius: 8, fontSize: 14, zIndex: 1000, boxShadow: "0 4px 12px rgba(0,0,0,.2)" }}>{toast}</div>}
    </div>
  );

  if (profile.role === "admin") return shell(<AdminPanel profiles={profiles.filter(p => p.id !== profile.id)} files={files} requests={requests} addMember={addMember} resetMemberPassword={resetMemberPassword} setMemberDisabled={setMemberDisabled} renameMember={renameMember} updateFileField={updateFileField} addRemark={addRemark} deleteFile={deleteFile} clearFileRequester={clearFileRequester} showToast={showToast} changeMyPassword={changeMyPassword} />);
  if (profile.role === "pic") return shell(<PICPanel profile={profile} files={files} requests={requests} submitRequest={submitRequest} showToast={showToast} changeMyPassword={changeMyPassword} />);
  if (profile.role === "op") return shell(<OPPanel profile={profile} files={files} requests={requests} addFile={addFile} updateFileField={updateFileField} addRemark={addRemark} showToast={showToast} changeMyPassword={changeMyPassword} />);
}

/* ── LOGIN ─────────────────────────────────────────────── */
function LoginScreen({ showToast, toast }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !pw) return showToast("Enter email and password");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) showToast(error.message);
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100vh", background: "linear-gradient(160deg, #0a1929 0%, #1e3a5f 50%, #0f2942 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, background: "#c9a227", borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#0f2942", marginBottom: 12 }}>E</div>
          <h1 style={{ color: "#fff", margin: "8px 0 4px", fontSize: 22, letterSpacing: 2 }}>EZRI FILE SYSTEM</h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: 13 }}>Physical File Tracking & Management</p>
        </div>
        <Card style={{ width: 340, textAlign: "left" }}>
          <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@ezri.my" />
          <Input label="Password" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Enter password"
            onKeyDown={e => { if (e.key === "Enter") submit(); }} />
          <Btn style={{ width: "100%", marginTop: 4 }} onClick={submit} disabled={busy}>Sign In</Btn>
        </Card>
      </div>
      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#dc2626", color: "#fff", padding: "10px 24px", borderRadius: 8, fontSize: 14, zIndex: 1000 }}>{toast}</div>}
    </div>
  );
}

/* ── RESET PASSWORD (recovery link landing) ────────────── */
function ResetPasswordScreen({ onDone, showToast, toast }) {
  const [np, setNp] = useState("");
  const [np2, setNp2] = useState("");
  const submit = async () => {
    if (np.length < 6) return showToast("Password must be at least 6 characters");
    if (np !== np2) return showToast("Passwords do not match");
    const { error } = await supabase.auth.updateUser({ password: np });
    if (error) return showToast(error.message);
    showToast("Password updated. Please log in.");
    await supabase.auth.signOut();
    onDone();
  };
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100vh", background: "linear-gradient(160deg, #0a1929 0%, #1e3a5f 50%, #0f2942 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Card style={{ width: 340 }}>
        <h3 style={{ marginTop: 0, color: "#1e293b" }}>Set a New Password</h3>
        <Input label="New Password" type="password" value={np} onChange={e => setNp(e.target.value)} />
        <Input label="Confirm New Password" type="password" value={np2} onChange={e => setNp2(e.target.value)} />
        <Btn style={{ width: "100%" }} onClick={submit}>Update Password</Btn>
      </Card>
      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", padding: "10px 24px", borderRadius: 8, fontSize: 14, zIndex: 1000 }}>{toast}</div>}
    </div>
  );
}

/* ── CHANGE PASSWORD MODAL ───────────────────────────── */
function ChangePasswordModal({ onClose, showToast, changeMyPassword }) {
  const [cur, setCur] = useState("");
  const [np, setNp] = useState("");
  const [np2, setNp2] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (np.length < 6) return showToast("New password must be at least 6 characters");
    if (np !== np2) return showToast("New passwords do not match");
    setBusy(true);
    try {
      await changeMyPassword(cur, np);
      showToast("Password changed successfully");
      onClose();
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Change Password" onClose={onClose}>
      <Input label="Current Password" type="password" value={cur} onChange={e => setCur(e.target.value)} />
      <Input label="New Password" type="password" value={np} onChange={e => setNp(e.target.value)} />
      <Input label="Confirm New Password" type="password" value={np2} onChange={e => setNp2(e.target.value)} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn onClick={submit} disabled={busy}>Update Password</Btn>
      </div>
    </Modal>
  );
}

/* ── ADMIN PANEL ──────────────────────────────────────── */
function AdminPanel({ profiles, files, requests, addMember, resetMemberPassword, setMemberDisabled, renameMember, updateFileField, addRemark, deleteFile, clearFileRequester, showToast, changeMyPassword }) {
  const [tab, setTab] = useState("members");
  const [showAdd, setShowAdd] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [resetSentFor, setResetSentFor] = useState(null);
  const [form, setForm] = useState({ email: "", name: "", role: "pic" });
  const [newMemberPw, setNewMemberPw] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [viewFileId, setViewFileId] = useState(null);
  const [remark, setRemark] = useState("");

  const viewFile = files.find(f => f.id === viewFileId) || null;
  const filteredFiles = files.filter(f => {
    const s = search.toLowerCase();
    return !s || f.clientName.toLowerCase().includes(s) || f.caseReference.toLowerCase().includes(s) || f.boxReference.toLowerCase().includes(s);
  });

  const handleDelete = (f) => {
    if (!window.confirm(`Delete the file for "${f.clientName}" (Case: ${f.caseReference})? This cannot be undone.`)) return;
    deleteFile(f);
    setViewFileId(null);
  };

  const handleAddMember = async () => {
    const email = form.email.includes("@") ? form.email : form.email + "@ezri.my";
    if (!email.endsWith("@ezri.my")) return showToast("Email must end with @ezri.my");
    if (!form.name.trim()) return showToast("Name is required");
    setBusy(true);
    try {
      const password = await addMember({ email, name: form.name.trim(), role: form.role });
      setNewMemberPw({ email, password, name: form.name.trim() });
      setForm({ email: "", name: "", role: "pic" });
      setShowAdd(false);
      showToast("Member added");
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (m) => {
    try {
      await resetMemberPassword(m.email);
      setResetSentFor(m);
    } catch (e) {
      showToast(e.message);
    }
  };

  const saveName = (uid) => {
    if (!editName.trim()) return;
    renameMember(uid, editName.trim());
    setEditId(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div />
        <Btn variant="secondary" onClick={() => setShowPw(true)} style={{ fontSize: 12 }}>Change My Password</Btn>
      </div>
      <Tabs tabs={[{ id: "members", label: "Members" }, { id: "files", label: "File List" }]} active={tab} onChange={setTab} />

      {tab === "members" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <Btn onClick={() => setShowAdd(true)}>+ Add Member</Btn>
          </div>
          <Card>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", color: "#64748b", fontSize: 12, fontWeight: 600 }}>NAME</th>
                  <th style={{ padding: "10px 12px", color: "#64748b", fontSize: 12, fontWeight: 600 }}>EMAIL</th>
                  <th style={{ padding: "10px 12px", color: "#64748b", fontSize: 12, fontWeight: 600 }}>ROLE</th>
                  <th style={{ padding: "10px 12px", color: "#64748b", fontSize: 12, fontWeight: 600 }}>STATUS</th>
                  <th style={{ padding: "10px 12px", color: "#64748b", fontSize: 12, fontWeight: 600 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(m => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px" }}>
                      {editId === m.id ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <input value={editName} onChange={e => setEditName(e.target.value)} style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 14 }} />
                          <Btn variant="success" onClick={() => saveName(m.id)} style={{ padding: "4px 10px", fontSize: 12 }}>Save</Btn>
                          <Btn variant="secondary" onClick={() => setEditId(null)} style={{ padding: "4px 10px", fontSize: 12 }}>Cancel</Btn>
                        </div>
                      ) : <span style={{ fontWeight: 500, color: "#1e293b" }}>{m.name}</span>}
                    </td>
                    <td style={{ padding: "12px", color: "#475569", fontSize: 14 }}>{m.email}</td>
                    <td style={{ padding: "12px" }}>
                      <Badge text={m.role.toUpperCase()} color={m.role === "pic" ? "#3b82f6" : "#059669"} />
                    </td>
                    <td style={{ padding: "12px" }}>
                      <Badge text={m.disabled ? "DEACTIVATED" : "ACTIVE"} color={m.disabled ? "#94a3b8" : "#10b981"} />
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Btn variant="secondary" onClick={() => { setEditId(m.id); setEditName(m.name); }} style={{ padding: "4px 10px", fontSize: 12 }}>Edit Name</Btn>
                        <Btn variant="secondary" onClick={() => handleReset(m)} style={{ padding: "4px 10px", fontSize: 12 }}>Send Password Reset</Btn>
                        {m.disabled
                          ? <Btn variant="success" onClick={() => setMemberDisabled(m.id, false)} style={{ padding: "4px 10px", fontSize: 12 }}>Reactivate</Btn>
                          : <Btn variant="danger" onClick={() => setMemberDisabled(m.id, true)} style={{ padding: "4px 10px", fontSize: 12 }}>Deactivate</Btn>}
                      </div>
                    </td>
                  </tr>
                ))}
                {profiles.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>No members yet. Add your first member above.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === "files" && (
        <div>
          <Input placeholder="Search by client name, case reference, or box reference..." value={search} onChange={e => setSearch(e.target.value)} />
          <FileTable files={filteredFiles} requests={requests} onView={f => { setViewFileId(f.id); setRemark(f.remarks || ""); }} onDelete={handleDelete} />
        </div>
      )}

      {viewFile && (
        <FileEditModal file={viewFile} remark={remark} setRemark={setRemark} onClose={() => setViewFileId(null)} updateFileField={updateFileField} addRemark={addRemark} onDelete={handleDelete} onClearRequester={clearFileRequester} />
      )}

      {showAdd && (
        <Modal title="Add New Member" onClose={() => setShowAdd(false)}>
          <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
          <Input label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@ezri.my" />
          <Select label="Role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
            options={[{ value: "pic", label: "PIC" }, { value: "op", label: "Operations Manager" }]} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowAdd(false)} disabled={busy}>Cancel</Btn>
            <Btn onClick={handleAddMember} disabled={busy}>Add Member</Btn>
          </div>
        </Modal>
      )}

      {newMemberPw && (
        <Modal title="Member Created" onClose={() => setNewMemberPw(null)}>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#166534" }}>Credentials Generated</p>
            <p style={{ margin: "4px 0", fontSize: 14 }}><strong>Name:</strong> {newMemberPw.name}</p>
            <p style={{ margin: "4px 0", fontSize: 14 }}><strong>Email:</strong> {newMemberPw.email}</p>
            <p style={{ margin: "4px 0", fontSize: 14 }}><strong>Password:</strong> <code style={{ background: "#dcfce7", padding: "2px 8px", borderRadius: 4 }}>{newMemberPw.password}</code></p>
          </div>
          <p style={{ fontSize: 12, color: "#64748b" }}>Save these credentials. The member can change their password after logging in.</p>
          <Btn onClick={() => setNewMemberPw(null)} style={{ width: "100%" }}>Done</Btn>
        </Modal>
      )}

      {resetSentFor && (
        <Modal title="Password Reset Sent" onClose={() => setResetSentFor(null)}>
          <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#854d0e" }}>Email Sent</p>
            <p style={{ margin: "4px 0", fontSize: 14 }}>A password reset link was sent to <strong>{resetSentFor.email}</strong> ({resetSentFor.name}).</p>
          </div>
          <Btn onClick={() => setResetSentFor(null)} style={{ width: "100%" }}>Done</Btn>
        </Modal>
      )}

      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} showToast={showToast} changeMyPassword={changeMyPassword} />}
    </div>
  );
}

/* ── PIC PANEL ────────────────────────────────────────── */
function PICPanel({ profile, files, requests, submitRequest, showToast, changeMyPassword }) {
  const [tab, setTab] = useState("dashboard");
  const [showPw, setShowPw] = useState(false);
  const [search, setSearch] = useState("");
  const [viewFileId, setViewFileId] = useState(null);
  const [form, setForm] = useState({ caseRef: "", clientName: "", useType: "Office Use" });
  const [busy, setBusy] = useState(false);

  const viewFile = files.find(f => f.id === viewFileId) || null;
  const myRequests = requests.filter(r => r.requestedBy === profile.id);
  const activeRequests = myRequests.filter(r => r.status !== "Delivered");
  const deliveredRequests = myRequests.filter(r => r.status === "Delivered");

  const handleSubmit = async () => {
    if (!form.caseRef.trim() || !form.clientName.trim()) return showToast("Fill in all fields");
    setBusy(true);
    try {
      await submitRequest({ caseRef: form.caseRef.trim(), clientName: form.clientName.trim(), useType: form.useType });
      setForm({ caseRef: "", clientName: "", useType: "Office Use" });
      showToast("File request submitted");
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const viewRequestFile = (r) => {
    const f = findFileByCaseRef(r.caseReference, files);
    if (!f) return showToast("No file record yet for this case");
    setViewFileId(f.id);
  };

  const filtered = files.filter(f => {
    const s = search.toLowerCase();
    return !s || f.clientName.toLowerCase().includes(s) || f.caseReference.toLowerCase().includes(s) || f.boxReference.toLowerCase().includes(s);
  });

  const requestRow = (r) => (
    <Card key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <div>
        <div style={{ fontWeight: 600, color: "#1e293b" }}>{r.clientName}</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Case: {r.caseReference} · {r.useType}</div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>{r.requestedAt ? new Date(r.requestedAt).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }) : ""}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Badge text={requestDisplayStatus(r, files)} color={STATUS_COLORS[requestDisplayStatus(r, files)] || "#94a3b8"} />
        <Btn variant="secondary" onClick={() => viewRequestFile(r)} style={{ padding: "4px 10px", fontSize: 12 }}>View</Btn>
      </div>
    </Card>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div />
        <Btn variant="secondary" onClick={() => setShowPw(true)} style={{ fontSize: 12 }}>Change Password</Btn>
      </div>
      <Tabs tabs={[
        { id: "dashboard", label: "My Requests", count: activeRequests.length },
        { id: "delivered", label: "Delivered" },
        { id: "request", label: "Request File" },
        { id: "files", label: "Search Files" },
      ]} active={tab} onChange={setTab} />

      {tab === "dashboard" && (
        <div>
          <h3 style={{ color: "#1e293b", marginTop: 0 }}>My File Requests</h3>
          {activeRequests.length === 0 ? <Card><p style={{ color: "#94a3b8", textAlign: "center" }}>No requests yet</p></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeRequests.map(requestRow)}
            </div>
          )}
        </div>
      )}

      {tab === "delivered" && (
        <div>
          <h3 style={{ color: "#1e293b", marginTop: 0 }}>Delivered</h3>
          {deliveredRequests.length === 0 ? <Card><p style={{ color: "#94a3b8", textAlign: "center" }}>No delivered requests yet</p></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {deliveredRequests.map(requestRow)}
            </div>
          )}
        </div>
      )}

      {tab === "request" && (
        <Card style={{ maxWidth: 480 }}>
          <h3 style={{ color: "#1e293b", marginTop: 0 }}>Request a File</h3>
          <Input label="Case Reference" value={form.caseRef} onChange={e => setForm({ ...form, caseRef: e.target.value })} placeholder="eg. 2000/1234" />
          <Input label="Client Name" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} placeholder="Client full name" />
          <Select label="Use Type" value={form.useType} onChange={e => setForm({ ...form, useType: e.target.value })} options={["Office Use", "Client Use"]} />
          <Btn onClick={handleSubmit} style={{ width: "100%", marginTop: 8 }} disabled={busy}>Submit Request</Btn>
        </Card>
      )}

      {tab === "files" && (
        <div>
          <Input placeholder="Search by client name, case reference, or box reference..." value={search} onChange={e => setSearch(e.target.value)} />
          <FileTable files={filtered} requests={requests} onView={f => setViewFileId(f.id)} />
        </div>
      )}

      {viewFile && <FileViewModal file={viewFile} onClose={() => setViewFileId(null)} />}

      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} showToast={showToast} changeMyPassword={changeMyPassword} />}
    </div>
  );
}

/* ── OP PANEL ─────────────────────────────────────────── */
function OPPanel({ profile, files, requests, addFile, updateFileField, addRemark, showToast, changeMyPassword }) {
  const [tab, setTab] = useState("dashboard");
  const [showPw, setShowPw] = useState(false);
  const [search, setSearch] = useState("");
  const [viewFileId, setViewFileId] = useState(null);
  const [addForm, setAddForm] = useState({ clientName: "", caseRef: "", boxRef: "" });
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);

  const viewFile = files.find(f => f.id === viewFileId) || null;
  const activeRequests = requests.filter(r => r.status !== "Delivered");
  const deliveredRequests = requests.filter(r => r.status === "Delivered");

  const handleAddFile = async () => {
    if (!addForm.clientName.trim() || !addForm.caseRef.trim() || !addForm.boxRef.trim()) return showToast("Fill in all fields");
    setBusy(true);
    try {
      await addFile({ clientName: addForm.clientName.trim(), caseRef: addForm.caseRef.trim(), boxRef: addForm.boxRef.trim() });
      setAddForm({ clientName: "", caseRef: "", boxRef: "" });
      showToast("File added");
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const viewRequestFile = (r) => {
    const f = findFileByCaseRef(r.caseReference, files);
    if (!f) return showToast("Add this case as a file first, from the Add File tab");
    setViewFileId(f.id);
    setRemark(f.remarks || "");
  };

  const filtered = files.filter(f => {
    const s = search.toLowerCase();
    return !s || f.clientName.toLowerCase().includes(s) || f.caseReference.toLowerCase().includes(s) || f.boxReference.toLowerCase().includes(s);
  });

  const requestRow = (r) => (
    <Card key={r.id}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, color: "#1e293b" }}>{r.clientName}</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Case: {r.caseReference} · {r.useType}</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Requested by {r.requestedByName} · {r.requestedAt ? new Date(r.requestedAt).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }) : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Badge text={requestDisplayStatus(r, files)} color={STATUS_COLORS[requestDisplayStatus(r, files)] || "#94a3b8"} />
          <Btn variant="secondary" onClick={() => viewRequestFile(r)} style={{ padding: "4px 10px", fontSize: 12 }}>View</Btn>
        </div>
      </div>
    </Card>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div />
        <Btn variant="secondary" onClick={() => setShowPw(true)} style={{ fontSize: 12 }}>Change Password</Btn>
      </div>
      <Tabs tabs={[
        { id: "dashboard", label: "Requests", count: activeRequests.length },
        { id: "delivered", label: "Delivered" },
        { id: "addfile", label: "Add File" },
        { id: "files", label: "File List" },
      ]} active={tab} onChange={setTab} />

      {tab === "dashboard" && (
        <div>
          <h3 style={{ color: "#1e293b", marginTop: 0 }}>Incoming Requests</h3>
          {activeRequests.length === 0 ? <Card><p style={{ color: "#94a3b8", textAlign: "center" }}>No requests yet</p></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeRequests.map(requestRow)}
            </div>
          )}
        </div>
      )}

      {tab === "delivered" && (
        <div>
          <h3 style={{ color: "#1e293b", marginTop: 0 }}>Delivered</h3>
          {deliveredRequests.length === 0 ? <Card><p style={{ color: "#94a3b8", textAlign: "center" }}>No delivered requests yet</p></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {deliveredRequests.map(requestRow)}
            </div>
          )}
        </div>
      )}

      {tab === "addfile" && (
        <Card style={{ maxWidth: 480 }}>
          <h3 style={{ color: "#1e293b", marginTop: 0 }}>Add New File</h3>
          <Input label="Client Name" value={addForm.clientName} onChange={e => setAddForm({ ...addForm, clientName: e.target.value })} placeholder="Client full name" />
          <Input label="Case Reference" value={addForm.caseRef} onChange={e => setAddForm({ ...addForm, caseRef: e.target.value })} placeholder="eg. 2000/1234" />
          <Input label="Box Reference" value={addForm.boxRef} onChange={e => setAddForm({ ...addForm, boxRef: e.target.value })} placeholder="eg. EZR123" />
          <Btn onClick={handleAddFile} style={{ width: "100%", marginTop: 8 }} disabled={busy}>Add File</Btn>
        </Card>
      )}

      {tab === "files" && (
        <div>
          <Input placeholder="Search by client name, case reference, or box reference..." value={search} onChange={e => setSearch(e.target.value)} />
          <FileTable files={filtered} requests={requests} onView={f => { setViewFileId(f.id); setRemark(f.remarks || ""); }} />
        </div>
      )}

      {viewFile && (
        <FileEditModal file={viewFile} remark={remark} setRemark={setRemark} onClose={() => setViewFileId(null)} updateFileField={updateFileField} addRemark={addRemark} />
      )}

      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} showToast={showToast} changeMyPassword={changeMyPassword} />}
    </div>
  );
}
