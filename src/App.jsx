import React, { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { createClient } from "@supabase/supabase-js";

/* ========= Supabase ========= */
const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = SB_URL && SB_KEY ? createClient(SB_URL, SB_KEY) : null;

/* ========= Helpers ========= */
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString();
};
const relTime = (iso) => {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};
const hoursAgo = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60) : Infinity);
/** Recency icons:
 * <3h  -> 🔥
 * 3–10h -> 🆕
 * 10–24h -> 🕒
 * else -> ""
 */
const recencyIcon = (iso) => {
  const h = hoursAgo(iso);
  if (h < 3) return { icon: "🔥", label: "Hot: < 3 hours" };
  if (h < 10) return { icon: "🆕", label: "New: 3–10 hours" };
  if (h < 24) return { icon: "🕒", label: "Recent: 10–24 hours" };
  return { icon: "", label: "" };
};

/* date helpers */
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isoStart = (d) => startOfDay(d).toISOString();

export default function App() {
  /* theme */
  const [theme, setTheme] = useState("light");

  /* simple nav: Dashboard | Cleanup */
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard' | 'cleanup'

  /* drawer */
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  /* filters */
  const [appliedTab, setAppliedTab] = useState("All"); // All | Applied | Not Applied
  const [dateQuick, setDateQuick] = useState("All dates"); // All dates | Today | Yesterday | Last 7 days
  const [appliedDrop, setAppliedDrop] = useState("All");
  const [dateDrop, setDateDrop] = useState("All Dates");
  const [search, setSearch] = useState("");

  /* data */
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [appliedCount, setAppliedCount] = useState(0);
  const [notAppliedCount, setNotAppliedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  /* pagination */
  const [page, setPage] = useState(1);
  const pageSize = 15;

  /* cleanup tab state */
  const [cleanupPreset, setCleanupPreset] = useState("olderThanYesterday"); // olderThanYesterday | olderThan7 | olderThan30 | olderThan90 | beforeDate
  const [cleanupDate, setCleanupDate] = useState(""); // yyyy-mm-dd
  const [cleanupAppliedScope, setCleanupAppliedScope] = useState("All"); // All | Not Applied | Applied
  const [previewCount, setPreviewCount] = useState(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupErr, setCleanupErr] = useState("");

  /* body margin when drawer open */
  useEffect(() => {
    document.body.classList.toggle("drawer-open", isDrawerOpen);
  }, [isDrawerOpen]);

  /* esc to close drawer */
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && closeDrawer();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openDrawer(job) {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  }
  function closeDrawer() {
    setIsDrawerOpen(false);
    setSelectedJob(null);
  }

  /* date quick pills -> ISO range */
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (dateQuick) {
      case "Today": {
        const s = isoStart(now);
        const e = isoStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
        return { from: s, to: e };
      }
      case "Yesterday": {
        const y = new Date(now);
        y.setDate(now.getDate() - 1);
        const s = isoStart(y);
        const e = isoStart(new Date(y.getFullYear(), y.getMonth(), y.getDate() + 1));
        return { from: s, to: e };
      }
      case "Last 7 days": {
        const sDate = new Date(now);
        sDate.setDate(now.getDate() - 6);
        const s = isoStart(sDate);
        const e = isoStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
        return { from: s, to: e };
      }
      default:
        return null;
    }
  }, [dateQuick]);

  async function refreshCounts() {
    if (!supabase) return;
    const base = supabase.from("jobs").select("*", { count: "exact", head: true });
    const [a, b, c] = await Promise.all([
      base,
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("Applied", true),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("Applied", false),
    ]);
    setTotalCount(a.count || 0);
    setAppliedCount(b.count || 0);
    setNotAppliedCount(c.count || 0);
  }

  async function fetchPage() {
    if (!supabase) return;
    setLoading(true);
    setErr("");
    try {
      let q = supabase.from("jobs").select("*", { count: "exact" });

      // Applied filter
      const appliedPref = appliedTab !== "All" ? appliedTab : appliedDrop;
      if (appliedPref === "Applied") q = q.eq("Applied", true);
      if (appliedPref === "Not Applied") q = q.eq("Applied", false);

      // Date filter
      if (dateRange) q = q.gte("added_at", dateRange.from).lt("added_at", dateRange.to);

      // Search (correct OR syntax)
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        q = q.or(
          `title.ilike.%${term}%,company.ilike.%${term}%,location.ilike.%${term}%,source.ilike.%${term}%`
        );
      }

      // Sort & paginate
      q = q.order("added_at", { ascending: false });
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;

      const shaped =
        data?.map((r) => {
          const rci = recencyIcon(r.added_at || r.posted_date);
          return {
            ...r,
            added_fmt: fmtDate(r.added_at),
            posted_rel: r.posted_date ? relTime(r.posted_date) : "—",
            recency_icon: rci.icon,
            recency_label: rci.label,
          };
        }) ?? [];

      setRows(shaped);
      if (typeof count === "number") setTotalCount(count);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!supabase) return;
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedTab, appliedDrop, dateQuick, dateDrop, search, page]);

  useEffect(() => {
    if (!supabase) return;
    refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleApplied(job) {
    if (!supabase || !job) return;
    try {
      const next = !job.Applied;
      await supabase.from("jobs").update({ Applied: next }).eq("id", job.id);
      setRows((rs) => rs.map((r) => (r.id === job.id ? { ...r, Applied: next } : r)));
      refreshCounts();
      if (selectedJob?.id === job.id) setSelectedJob({ ...job, Applied: next });
    } catch (e) {
      console.error(e);
      alert("Update failed");
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  /* ========= Cleanup logic ========= */

  // Build a where-clause for preview/delete based on UI
  function buildCleanupFilters() {
    const now = new Date();
    let cutoffIso = null;

    switch (cleanupPreset) {
      case "olderThanYesterday": {
        const y = new Date(now);
        y.setDate(now.getDate() - 1);
        cutoffIso = isoStart(y); // anything strictly before start of yesterday
        break;
      }
      case "olderThan7": {
        const d = new Date(now);
        d.setDate(now.getDate() - 7);
        cutoffIso = isoStart(d);
        break;
      }
      case "olderThan30": {
        const d = new Date(now);
        d.setDate(now.getDate() - 30);
        cutoffIso = isoStart(d);
        break;
      }
      case "olderThan90": {
        const d = new Date(now);
        d.setDate(now.getDate() - 90);
        cutoffIso = isoStart(d);
        break;
      }
      case "beforeDate": {
        if (!cleanupDate) return { error: "Please pick a date." };
        const d = new Date(cleanupDate + "T00:00:00"); // local midnight
        if (Number.isNaN(d.getTime())) return { error: "Invalid date." };
        cutoffIso = d.toISOString();
        break;
      }
      default:
        return { error: "Unknown preset." };
    }

    return { cutoffIso };
  }

  async function previewCleanup() {
    setCleanupErr("");
    setPreviewCount(null);
    if (!supabase) return;
    const { cutoffIso, error } = buildCleanupFilters();
    if (error) return setCleanupErr(error);

    let q = supabase.from("jobs").select("*", { count: "exact", head: true }).lt("added_at", cutoffIso);

    if (cleanupAppliedScope === "Not Applied") q = q.eq("Applied", false);
    if (cleanupAppliedScope === "Applied") q = q.eq("Applied", true);

    const { count, error: err2 } = await q;
    if (err2) return setCleanupErr(err2.message || "Preview failed.");
    setPreviewCount(count || 0);
  }

  async function runCleanup() {
    setCleanupErr("");
    if (!supabase) return;
    const { cutoffIso, error } = buildCleanupFilters();
    if (error) return setCleanupErr(error);

    // Safety: require confirmation
    const human = (() => {
      switch (cleanupPreset) {
        case "olderThanYesterday": return "everything added before the start of yesterday";
        case "olderThan7": return "everything added more than 7 days ago";
        case "olderThan30": return "everything added more than 30 days ago";
        case "olderThan90": return "everything added more than 90 days ago";
        case "beforeDate": return `everything added before ${cleanupDate}`;
        default: return "the selected records";
      }
    })();
    const appliedScopeText =
      cleanupAppliedScope === "All" ? "" : ` AND where Applied is ${cleanupAppliedScope}`;

    if (!window.confirm(`This will permanently DELETE ${human}${appliedScopeText}.\n\nAre you sure?`)) return;

    setCleanupBusy(true);
    try {
      let q = supabase.from("jobs").delete().lt("added_at", cutoffIso);

      if (cleanupAppliedScope === "Not Applied") q = q.eq("Applied", false);
      if (cleanupAppliedScope === "Applied") q = q.eq("Applied", true);

      const { error: delErr } = await q;
      if (delErr) throw delErr;

      // refresh dashboard data & counts
      await Promise.all([fetchPage(), refreshCounts()]);
      setPreviewCount(null);
      alert("Cleanup complete.");
    } catch (e) {
      console.error(e);
      setCleanupErr(e.message || "Delete failed.");
    } finally {
      setCleanupBusy(false);
    }
  }

  /* ========= No keys panel ========= */
  if (!supabase) {
    return (
      <div className="app">
        <Header theme={theme} setTheme={setTheme} setActiveTab={setActiveTab} activeTab={activeTab} />
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Supabase keys missing</h3>
          <p style={{ margin: "6px 0 0", color: "#475569" }}>
            Add a <code>.env.local</code> with:
          </p>
          <pre
            style={{
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 12,
              marginTop: 10,
              overflowX: "auto",
            }}
          >{`VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=ey...`}</pre>
          <p style={{ color: "#64748b" }}>Then run <code>npm run dev</code> again.</p>
        </div>
      </div>
    );
  }

  /* ========= Main UI ========= */
  return (
    <div className={`app ${theme}`}>
      <Header theme={theme} setTheme={setTheme} setActiveTab={setActiveTab} activeTab={activeTab} />

      {activeTab === "dashboard" ? (
        <>
          {/* KPIs */}
          <div className="kpis">
            <div className="card">
              <h3>Total Jobs</h3>
              <div className="big">{totalCount.toLocaleString()}</div>
            </div>
            <div className="card">
              <h3>Applied</h3>
              <div className="big" style={{ color: "var(--ok)" }}>{appliedCount.toLocaleString()}</div>
            </div>
            <div className="card">
              <h3>Not Applied</h3>
              <div className="big" style={{ color: "var(--bad)" }}>{notAppliedCount.toLocaleString()}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="filters">
            <button className={`pill ${appliedTab === "All" ? "active" : ""}`} onClick={() => { setAppliedTab("All"); setAppliedDrop("All"); setPage(1); }}>All</button>
            <button className={`pill ${appliedTab === "Applied" ? "active" : ""}`} onClick={() => { setAppliedTab("Applied"); setAppliedDrop("Applied"); setPage(1); }}>Applied</button>
            <button className={`pill ${appliedTab === "Not Applied" ? "active" : ""}`} onClick={() => { setAppliedTab("Not Applied"); setAppliedDrop("Not Applied"); setPage(1); }}>Not Applied</button>

            <button className={`pill ${dateQuick === "All dates" ? "active" : ""}`} onClick={() => { setDateQuick("All dates"); setPage(1); }}>All dates</button>
            <button className={`pill ${dateQuick === "Today" ? "active" : ""}`} onClick={() => { setDateQuick("Today"); setPage(1); }}>Today</button>
            <button className={`pill ${dateQuick === "Yesterday" ? "active" : ""}`} onClick={() => { setDateQuick("Yesterday"); setPage(1); }}>Yesterday</button>
            <button className={`pill ${dateQuick === "Last 7 days" ? "active" : ""}`} onClick={() => { setDateQuick("Last 7 days"); setPage(1); }}>Last 7 days</button>

            <div className="field-wrap" style={{ marginLeft: "auto" }}>
              <select className="select" value={appliedDrop} onChange={(e) => { setAppliedDrop(e.target.value); setAppliedTab("All"); setPage(1); }}>
                <option>All</option>
                <option>Applied</option>
                <option>Not Applied</option>
              </select>

              <select className="select" value={dateDrop} onChange={(e) => { setDateDrop(e.target.value); setPage(1); }}>
                <option>All Dates</option>
              </select>

              <input className="input" placeholder="Search title / company / location / source" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </div>

          {/* Table */}
          <div className="table" role="table" aria-label="Jobs table">
            <div className="table-header">
              <div className="thead" role="row">
                <div>Added</div>
                <div>New</div>
                <div>Title</div>
                <div>Company</div>
                <div>Location</div>
                <div>Source</div>
                <div>Applied</div>
                <div>Link</div>
              </div>
            </div>

            <div className="tbody">
              {err && (
                <div className="row"><div className="cell" style={{ gridColumn: "1 / -1", color: "var(--bad)" }}>{err}</div></div>
              )}

              {loading && (
                <div className="row"><div className="cell" style={{ gridColumn: "1 / -1", color: "#64748b" }}>Loading…</div></div>
              )}

              {!loading && rows.length === 0 && !err && (
                <div className="row"><div className="cell" style={{ gridColumn: "1 / -1", color: "#64748b" }}>No results.</div></div>
              )}

              {rows.map((r) => (
                <div key={r.id} className="row" role="row" tabIndex={0} onClick={() => openDrawer(r)}>
                  <div className="cell">{r.added_fmt}</div>
                  <div className="cell" title={r.recency_label} aria-label={r.recency_label} style={{ textAlign: "center" }}>
                    {r.recency_icon}
                  </div>
                  <div className="cell">{r.title}</div>
                  <div className="cell">{r.company}</div>
                  <div className="cell">{r.location}</div>
                  <div className="cell">{r.source}</div>
                  <div className="cell" onClick={(e) => e.stopPropagation()}>
                    {r.Applied ? (
                      <span className="badge ok">Applied</span>
                    ) : (
                      <button className="btn sm" onClick={() => toggleApplied(r)}>Mark Applied</button>
                    )}
                  </div>
                  <div className="cell">
                    {r.url ? (
                      <a className="link" href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        Open
                      </a>
                    ) : "—"}
                  </div>
                </div>
              ))}
            </div>

            <div className="pagination">
              <div style={{ alignSelf: "center", marginRight: "auto", color: "#64748b" }}>
                Page {page} / {totalPages.toLocaleString()}
              </div>
              <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
              <button className="btn sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>

          {/* Backdrop + Drawer */}
          {isDrawerOpen && <div className="backdrop" onClick={closeDrawer} />}
          <aside className={`drawer ${isDrawerOpen ? "open" : ""}`} aria-hidden={!isDrawerOpen}>
            <div className="drawer-head">
              <h2 className="drawer-title">{selectedJob?.title || "Job details"}</h2>
              <button className="btn ghost sm" onClick={closeDrawer}>Close</button>
            </div>
            <div className="drawer-body">
              <div className="field"><label>Company</label><div>{selectedJob?.company || "—"}</div></div>
              <div className="field"><label>Location</label><div>{selectedJob?.location || "—"}</div></div>
              <div className="field"><label>Source</label><div>{selectedJob?.source || "—"}</div></div>
              <div className="field"><label>Added</label><div>{fmtDate(selectedJob?.added_at)}</div></div>
              <div className="field"><label>Posted</label><div>{selectedJob?.posted_date ? relTime(selectedJob.posted_date) : "—"}</div></div>

              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                {selectedJob?.url && <a className="btn" href={selectedJob.url} target="_blank" rel="noreferrer">Open link</a>}
                <button className="btn ghost" onClick={() => selectedJob?.url && navigator.clipboard.writeText(selectedJob.url)}>Copy URL</button>
                <button className="btn ghost" onClick={() => selectedJob && toggleApplied(selectedJob)}>
                  {selectedJob?.Applied ? "Mark Not Applied" : "Mark Applied"}
                </button>
              </div>

              <p className="notice">Tip: click outside or press Esc to close.</p>
            </div>
          </aside>
        </>
      ) : (
        /* ============ CLEANUP TAB ============ */
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ marginTop: 0 }}>Bulk Cleanup</h3>
          <p style={{ color: "#475569", marginTop: 6 }}>
            Delete old records you no longer need. Use a preset or pick a date. You can limit to <b>Not Applied</b> jobs only.
          </p>

          <div className="cleanup-row">
            <div className="cleanup-group">
              <label className="cleanup-label">Preset</label>
              <div className="seg">
                <button className={`seg-btn ${cleanupPreset === "olderThanYesterday" ? "active" : ""}`} onClick={() => setCleanupPreset("olderThanYesterday")}>Older than Yesterday</button>
                <button className={`seg-btn ${cleanupPreset === "olderThan7" ? "active" : ""}`} onClick={() => setCleanupPreset("olderThan7")}>Older than 7d</button>
                <button className={`seg-btn ${cleanupPreset === "olderThan30" ? "active" : ""}`} onClick={() => setCleanupPreset("olderThan30")}>Older than 30d</button>
                <button className={`seg-btn ${cleanupPreset === "olderThan90" ? "active" : ""}`} onClick={() => setCleanupPreset("olderThan90")}>Older than 90d</button>
                <button className={`seg-btn ${cleanupPreset === "beforeDate" ? "active" : ""}`} onClick={() => setCleanupPreset("beforeDate")}>Before date…</button>
              </div>
            </div>

            <div className="cleanup-group">
              <label className="cleanup-label">Custom date (if selected)</label>
              <input
                type="date"
                className="select"
                value={cleanupDate}
                onChange={(e) => setCleanupDate(e.target.value)}
                disabled={cleanupPreset !== "beforeDate"}
                style={{ width: 200 }}
              />
            </div>

            <div className="cleanup-group">
              <label className="cleanup-label">Applied scope</label>
              <select
                className="select"
                value={cleanupAppliedScope}
                onChange={(e) => setCleanupAppliedScope(e.target.value)}
              >
                <option>All</option>
                <option>Not Applied</option>
                <option>Applied</option>
              </select>
            </div>
          </div>

          {cleanupErr && (
            <div className="notice" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fee2e2" }}>
              {cleanupErr}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="btn ghost" onClick={previewCleanup} disabled={cleanupBusy}>Preview</button>
            <button className="btn danger" onClick={runCleanup} disabled={cleanupBusy}>
              {cleanupBusy ? "Deleting…" : "Delete matched"}
            </button>
          </div>

          {previewCount !== null && (
            <p style={{ marginTop: 10, color: "#475569" }}>
              Preview: <b>{previewCount.toLocaleString()}</b> rows will be deleted.
            </p>
          )}

          <p className="notice" style={{ marginTop: 14 }}>
            Safety: We delete by <code>added_at</code>. Ensure your RLS policies allow deletes from this table for your key.
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- Header (nav + theme toggle) ---------- */
function Header({ theme, setTheme, activeTab, setActiveTab }) {
  return (
    <>
      <div className="header">
        <div className="title">
          <div className="dot" />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Jobs Dashboard</div>
            <div className="subtitle">Filter, track, update — and now clean up in bulk</div>
          </div>
        </div>
        <button className="btn ghost sm" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}>
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>
          Dashboard
        </button>
        <button className={`tab ${activeTab === "cleanup" ? "active" : ""}`} onClick={() => setActiveTab("cleanup")}>
          Cleanup
        </button>
      </div>
    </>
  );
}
