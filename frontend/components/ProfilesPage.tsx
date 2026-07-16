"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Pencil, Check, RefreshCw, AlertCircle,
  Wifi, WifiOff, CheckCircle2, Search, Copy, ClipboardCheck,
} from "lucide-react";
import {
  fetchProfiles, createProfile, updateProfile, deleteProfile,
  testConnection, testSavedProfile, ConnectionTestResult,
} from "@/lib/api";
import { Profile, EnvTag } from "@/lib/types";
import { ProfileAvatar, EnvTagBadge } from "./ProfileAvatar";
import SlideOverDrawer from "./SlideOverDrawer";

// ── Constants ─────────────────────────────────────────────────────────────
const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-north-1",
  "sa-east-1", "ca-central-1", "me-south-1", "af-south-1",
];

const COLOR_GROUPS = [
  { label: "Production",     hint: "red / orange",    colors: ["#ef4444", "#f97316", "#f43f5e", "#dc2626"] },
  { label: "Staging",        hint: "yellow / amber",  colors: ["#eab308", "#f59e0b", "#d97706", "#ca8a04"] },
  { label: "Development",    hint: "green / teal",    colors: ["#22c55e", "#10b981", "#14b8a6", "#16a34a"] },
  { label: "Internal / Other", hint: "blue / purple", colors: ["#3b82f6", "#6366f1", "#8b5cf6", "#06b6d4"] },
];

const ALL_COLORS = COLOR_GROUPS.flatMap(g => g.colors);

const ENV_TAGS: { value: EnvTag; label: string }[] = [
  { value: "prod",    label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "dev",     label: "Development" },
  { value: "sandbox", label: "Sandbox" },
  { value: "other",   label: "Other" },
];

const ENV_TAG_DEFAULT_COLOR: Record<EnvTag, string> = {
  prod: "#ef4444", staging: "#eab308", dev: "#22c55e", sandbox: "#8b5cf6", other: "#6366f1",
};

const EMPTY_FORM = {
  name: "", access_key: "", secret_key: "",
  region: "us-east-1", color: ALL_COLORS[4], env_tag: "other" as EnvTag,
};

// ── Types ─────────────────────────────────────────────────────────────────
type FormValues = {
  name: string; access_key: string; secret_key: string;
  region: string; color: string; env_tag: EnvTag;
};

type TestStatus = "idle" | "testing" | "success" | "error";
interface TestState { status: TestStatus; result?: ConnectionTestResult; }

// ── Shared input class ────────────────────────────────────────────────────
const inputCls =
  "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors dark:bg-[#0f1117] dark:border-[#2a2d3a] dark:text-slate-200 dark:placeholder-slate-600";

// ── SemanticColorPicker ───────────────────────────────────────────────────
function SemanticColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="space-y-2">
      {COLOR_GROUPS.map(group => (
        <div key={group.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-slate-400 dark:text-slate-500 text-right leading-tight">
            {group.label}
          </span>
          <div className="flex items-center gap-1.5">
            {group.colors.map(c => (
              <button
                key={c} type="button" onClick={() => onChange(c)} aria-label={`Select color ${c}`}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none ${
                  value === c ? "ring-2 ring-offset-2 ring-slate-400 dark:ring-slate-500 scale-110" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── EnvTagSelector ────────────────────────────────────────────────────────
function EnvTagSelector({
  value, onChange, onColorSuggest,
}: {
  value: EnvTag;
  onChange: (t: EnvTag) => void;
  onColorSuggest: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ENV_TAGS.map(tag => (
        <button
          key={tag.value} type="button"
          onClick={() => { onChange(tag.value); onColorSuggest(ENV_TAG_DEFAULT_COLOR[tag.value]); }}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
            value === tag.value
              ? "bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900 dark:border-white"
              : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 dark:bg-transparent dark:text-slate-400 dark:border-[#2a2d3a] dark:hover:border-slate-500"
          }`}
        >
          {tag.label}
        </button>
      ))}
    </div>
  );
}

// ── TestBadge ─────────────────────────────────────────────────────────────
function TestBadge({ state }: { state: TestState }) {
  if (state.status === "idle") return null;
  if (state.status === "testing") {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <RefreshCw size={14} className="animate-spin" /> Testing connection…
      </div>
    );
  }
  if (state.status === "success" && state.result) {
    return (
      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400 space-y-0.5">
        <div className="flex items-center gap-1.5 font-medium">
          <CheckCircle2 size={13} /> Connection successful
        </div>
        {state.result.account_id && (
          <div className="text-emerald-600 dark:text-emerald-500 pl-5">
            Account: <span className="font-mono">{state.result.account_id}</span>
          </div>
        )}
        {state.result.arn && (
          <div className="text-emerald-600 dark:text-emerald-500 pl-5 truncate">
            ARN: <span className="font-mono">{state.result.arn}</span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 px-3 py-2 text-xs text-red-700 dark:text-red-400">
      <WifiOff size={13} className="mt-0.5 shrink-0" />
      <span>{state.result?.message ?? "Connection failed"}</span>
    </div>
  );
}

// ── CopyErrorButton ───────────────────────────────────────────────────────
function CopyErrorButton({ error }: { error: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(error);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 underline hover:no-underline"
    >
      {copied ? <ClipboardCheck size={14} /> : <Copy size={14} />}
      {copied ? "Copied!" : "Copy error details"}
    </button>
  );
}

// ── ProfileForm ───────────────────────────────────────────────────────────
interface ProfileFormProps {
  mode: "add" | "edit";
  profileId?: number; // only for edit mode
  initialValues: FormValues;
  onSuccess: (profile: Profile) => void;
  onClose: () => void;
}

function ProfileForm({ mode, profileId, initialValues, onSuccess, onClose }: ProfileFormProps) {
  const [form, setForm] = useState<FormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  // Keep form in sync when initialValues change (e.g., opening edit for a different profile)
  useEffect(() => {
    setForm(initialValues);
    setFormError(null);
    setTestState({ status: "idle" });
  }, [initialValues]);

  const handleTest = async () => {
    if (!form.access_key.trim() || !form.secret_key.trim()) {
      setTestState({ status: "error", result: { ok: false, message: "Enter Access Key and Secret Key first." } });
      return;
    }
    setTestState({ status: "testing" });
    try {
      const result = await testConnection({ access_key: form.access_key, secret_key: form.secret_key, region: form.region });
      setTestState({ status: result.ok ? "success" : "error", result });
    } catch (e) {
      setTestState({ status: "error", result: { ok: false, message: e instanceof Error ? e.message : "Request failed" } });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) { setFormError("Profile name is required."); return; }
    if (mode === "add" && (!form.access_key.trim() || !form.secret_key.trim())) {
      setFormError("Access Key and Secret Key are required."); return;
    }
    setSubmitting(true);
    try {
      if (mode === "add") {
        const created = await createProfile(form);
        onSuccess(created);
      } else {
        // edit: only send changed fields
        const patch: Partial<FormValues> = {};
        if (form.name !== initialValues.name) patch.name = form.name;
        if (form.region !== initialValues.region) patch.region = form.region;
        if (form.color !== initialValues.color) patch.color = form.color;
        if (form.env_tag !== initialValues.env_tag) patch.env_tag = form.env_tag;
        if (form.access_key.trim()) patch.access_key = form.access_key;
        if (form.secret_key.trim()) patch.secret_key = form.secret_key;
        if (Object.keys(patch).length === 0) { setFormError("No changes detected."); setSubmitting(false); return; }
        const updated = await updateProfile(profileId ?? 0, patch);
        onSuccess(updated);
      }
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Live preview in drawer header area */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-[#0f1117] border border-slate-200 dark:border-[#2a2d3a] mb-4">
        <ProfileAvatar name={form.name || "?"} color={form.color} size="lg" />
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{form.name || "Profile name"}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {form.region} · <EnvTagBadge tag={form.env_tag} />
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Profile name</label>
          <input type="text" placeholder="e.g. Production-US" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Environment</label>
          <EnvTagSelector value={form.env_tag}
            onChange={t => setForm(f => ({ ...f, env_tag: t }))}
            onColorSuggest={c => setForm(f => ({ ...f, color: c }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Region</label>
          <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} className={inputCls}>
            {AWS_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            AWS Access Key ID
            {mode === "edit" && <span className="ml-1 font-normal text-slate-400 dark:text-slate-600">(leave blank to keep current)</span>}
          </label>
          <input type="text" placeholder="AKIAIOSFODNN7EXAMPLE" value={form.access_key}
            onChange={e => { setForm(f => ({ ...f, access_key: e.target.value })); setTestState({ status: "idle" }); }}
            className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            AWS Secret Access Key
            {mode === "edit" && <span className="ml-1 font-normal text-slate-400 dark:text-slate-600">(leave blank to keep current)</span>}
          </label>
          <input type="password"
            placeholder={mode === "edit" ? "Leave blank to keep current" : "••••••••••••••••••••••••••••••••••••••••"}
            value={form.secret_key}
            onChange={e => { setForm(f => ({ ...f, secret_key: e.target.value })); setTestState({ status: "idle" }); }}
            className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Profile color
            <span className="ml-1 font-normal text-slate-400 dark:text-slate-600">(grouped by environment meaning)</span>
          </label>
          <SemanticColorPicker value={form.color} onChange={c => setForm(f => ({ ...f, color: c }))} />
        </div>
        {formError && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle size={14} /> {formError}
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={handleTest} disabled={testState.status === "testing"}
            className="flex items-center justify-center gap-2 flex-1 border border-slate-200 dark:border-[#2a2d3a] bg-white dark:bg-[#0f1117] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
            {testState.status === "testing" ? <><RefreshCw size={14} className="animate-spin" /> Testing…</> : <><Wifi size={14} /> Test Connection</>}
          </button>
          <button type="submit" disabled={submitting}
            className="flex items-center justify-center gap-2 flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
            {submitting ? <><RefreshCw size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save Profile</>}
          </button>
        </div>
        <TestBadge state={testState} />
        <button type="button" onClick={onClose}
          className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          Cancel
        </button>
      </form>
    </>
  );
}

// ── ProfilesPage ──────────────────────────────────────────────────────────
export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add");
  const [drawerProfile, setDrawerProfile] = useState<Profile | null>(null);

  // Inline delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Connection test state for saved profiles
  const [savedTests, setSavedTests] = useState<Record<number, TestState>>({});

  // Search
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setProfiles(await fetchProfiles());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Drawer handlers ──────────────────────────────────────────────────────
  const openAddDrawer = () => { setDrawerMode("add"); setDrawerProfile(null); setDrawerOpen(true); };
  const openEditDrawer = (p: Profile) => { setDrawerMode("edit"); setDrawerProfile(p); setDrawerOpen(true); };
  const closeDrawer = () => setDrawerOpen(false);

  // ── Drawer form success ──────────────────────────────────────────────────
  const handleFormSuccess = (profile: Profile) => {
    if (drawerMode === "add") {
      setProfiles(prev => [...prev, profile].sort((a, b) => a.name.localeCompare(b.name)));
    } else {
      setProfiles(prev => prev.map(p => p.id === profile.id ? profile : p).sort((a, b) => a.name.localeCompare(b.name)));
    }
    closeDrawer();
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteProfile(id);
      setProfiles(prev => prev.filter(p => p.id !== id));
      setConfirmDeleteId(null);
    } catch (e) {
      setDeleteErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : "Failed to delete" }));
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Connection test for saved profiles ──────────────────────────────────
  const handleTestSaved = async (id: number) => {
    setSavedTests(prev => ({ ...prev, [id]: { status: "testing" } }));
    try {
      const result = await testSavedProfile(id);
      setSavedTests(prev => ({ ...prev, [id]: { status: result.ok ? "success" : "error", result } }));
    } catch (e) {
      setSavedTests(prev => ({
        ...prev,
        [id]: { status: "error", result: { ok: false, message: e instanceof Error ? e.message : "Request failed" } },
      }));
    }
  };

  // ── Build initial form values for the drawer ─────────────────────────────
  const drawerInitialValues: FormValues = drawerProfile
    ? { name: drawerProfile.name, access_key: "", secret_key: "", region: drawerProfile.region, color: drawerProfile.color, env_tag: drawerProfile.env_tag }
    : { ...EMPTY_FORM };

  const filtered = profiles.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.region.toLowerCase().includes(search.toLowerCase()) ||
    p.env_tag.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-screen">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">AWS Profiles</h2>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            Manage the AWS accounts this dashboard connects to
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, region, or environment…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-[#161825] border border-slate-200 dark:border-[#2a2d3a] rounded-lg pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <button
            onClick={openAddDrawer}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus size={14} /> Add Profile
          </button>
        </div>

        {/* Profiles list */}
        <div className="bg-white dark:bg-[#161825] rounded-xl border border-slate-200 dark:border-[#2a2d3a] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2a2d3a]">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {search.trim()
                ? `${filtered.length} result${filtered.length === 1 ? "" : "s"}`
                : `Saved profiles (${profiles.length})`}
            </h3>
          </div>

          {loading ? (
            /* ── Skeleton rows ── */
            <ul>
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="px-6 py-4 border-b border-slate-100 dark:border-[#2a2d3a]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full animate-pulse bg-slate-200 dark:bg-slate-700" />
                    <div className="space-y-1.5">
                      <div className="w-32 h-3.5 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
                      <div className="w-20 h-3 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : error ? (
            /* ── Error state ── */
            <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/20 p-6 text-red-600 dark:text-red-400 m-4">
              <p className="font-semibold mb-1">Failed to load profiles</p>
              <p className="text-sm font-mono opacity-80 mb-3">{error}</p>
              <div className="flex items-center gap-3">
                <CopyErrorButton error={error} />
                <button onClick={() => load()} className="text-sm underline hover:no-underline">
                  Try again
                </button>
              </div>
            </div>
          ) : profiles.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
              No profiles yet. Click &ldquo;Add Profile&rdquo; above to get started.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
              No profiles match &ldquo;{search}&rdquo;.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
              {filtered.map(profile => (
                <li key={profile.id}>
                  <div className="px-6 py-3 hover:bg-slate-50 dark:hover:bg-[#1c1f2e] transition-colors">
                    <div className="flex items-center justify-between">
                      {/* Profile info */}
                      <div className="flex items-center gap-3">
                        <ProfileAvatar name={profile.name} color={profile.color} size="md" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{profile.name}</p>
                            <EnvTagBadge tag={profile.env_tag} />
                          </div>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{profile.region}</p>
                        </div>
                      </div>

                      {/* Action buttons — or inline delete confirmation */}
                      {confirmDeleteId === profile.id ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-600 dark:text-slate-300">Delete?</span>
                          <button
                            onClick={() => handleDelete(profile.id)}
                            disabled={deletingId === profile.id}
                            className="px-2 py-1 bg-red-600 text-white rounded font-medium hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingId === profile.id
                              ? <RefreshCw size={11} className="animate-spin" />
                              : "Confirm"}
                          </button>
                          <button
                            onClick={() => {
                              setConfirmDeleteId(null);
                              setDeleteErrors(e => { const n = { ...e }; delete n[profile.id]; return n; });
                            }}
                            className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          {/* Test connection */}
                          <button
                            onClick={() => handleTestSaved(profile.id)}
                            disabled={savedTests[profile.id]?.status === "testing"}
                            aria-label={`Test connection for ${profile.name}`}
                            className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-40"
                          >
                            {savedTests[profile.id]?.status === "testing"
                              ? <RefreshCw size={15} className="animate-spin" />
                              : savedTests[profile.id]?.status === "success"
                                ? <CheckCircle2 size={15} className="text-emerald-500" />
                                : savedTests[profile.id]?.status === "error"
                                  ? <WifiOff size={15} className="text-red-500" />
                                  : <Wifi size={15} />}
                          </button>
                          {/* Edit */}
                          <button
                            onClick={() => openEditDrawer(profile)}
                            aria-label={`Edit profile ${profile.name}`}
                            className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/30 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          {/* Delete */}
                          <button
                            onClick={() => setConfirmDeleteId(profile.id)}
                            aria-label={`Delete profile ${profile.name}`}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline delete error */}
                    {deleteErrors[profile.id] && (
                      <p className="text-xs text-red-500 mt-1 ml-12">{deleteErrors[profile.id]}</p>
                    )}

                    {/* Test badge for saved profile */}
                    {savedTests[profile.id]?.status && savedTests[profile.id].status !== "idle" && savedTests[profile.id].status !== "testing" && (
                      <div className="mt-2"><TestBadge state={savedTests[profile.id]} /></div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>

      {/* ── SlideOverDrawer ── */}
      <SlideOverDrawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        title={drawerMode === "add" ? "New Profile" : "Edit Profile"}
      >
        <ProfileForm
          key={drawerProfile ? `edit-${drawerProfile.id}` : "add"}
          mode={drawerMode}
          profileId={drawerProfile?.id}
          initialValues={drawerInitialValues}
          onSuccess={handleFormSuccess}
          onClose={closeDrawer}
        />
      </SlideOverDrawer>
    </div>
  );
}
