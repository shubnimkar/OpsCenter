"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Pencil, Check, RefreshCw, AlertCircle,
  Wifi, WifiOff, CheckCircle2, Search, Copy, ClipboardCheck,
  Server, HardDrive, Zap, Users, GripVertical,
  TestTube2, LayoutGrid, List, ArrowUpDown, BadgeCheck,
  X, ExternalLink, ChevronRight,
} from "lucide-react";
import {
  fetchProfiles, createProfile, updateProfile, deleteProfile,
  testConnection, testSavedProfile, fetchProfileSummary, reorderProfiles,
  ConnectionTestResult,
} from "@/lib/api";
import { Profile, ProfileSummary, EnvTag } from "@/lib/types";
import { ProfileAvatar, EnvTagBadge } from "./ProfileAvatar";
import SlideOverDrawer from "./SlideOverDrawer";
import Pagination, { PageSize } from "./Pagination";

// ── Constants ─────────────────────────────────────────────────────────────

const COLOR_GROUPS = [
  { label: "Production",       hint: "red / orange",   colors: ["#ef4444", "#f97316", "#f43f5e", "#dc2626"] },
  { label: "Staging",          hint: "yellow / amber", colors: ["#eab308", "#f59e0b", "#d97706", "#ca8a04"] },
  { label: "Development",      hint: "green / teal",   colors: ["#22c55e", "#10b981", "#14b8a6", "#16a34a"] },
  { label: "Internal / Other", hint: "blue / purple",  colors: ["#3b82f6", "#6366f1", "#8b5cf6", "#06b6d4"] },
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
  regions: ["us-east-1"], color: ALL_COLORS[4], env_tag: "other" as EnvTag,
};

// ── Types ─────────────────────────────────────────────────────────────────
type FormValues = {
  name: string; access_key: string; secret_key: string;
  regions: string[]; color: string; env_tag: EnvTag;
};
type TestStatus = "idle" | "testing" | "success" | "error";
interface TestState {
  status: TestStatus;
  result?: ConnectionTestResult;
  testedAt?: number;
}
type SortKey = "manual" | "name" | "env" | "regions" | "tested";
type ViewMode = "grid" | "list";

// ── Shared input class ────────────────────────────────────────────────────
const inputCls =
  "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors dark:bg-[#0f1117] dark:border-[#2a2d3a] dark:text-slate-200 dark:placeholder-slate-600";

// ── Helpers ───────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── SemanticColorPicker ───────────────────────────────────────────────────
function SemanticColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="space-y-2">
      {COLOR_GROUPS.map(group => (
        <div key={group.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-slate-400 dark:text-slate-500 text-right leading-tight">{group.label}</span>
          <div className="flex items-center gap-1.5">
            {group.colors.map(c => (
              <button key={c} type="button" onClick={() => onChange(c)} aria-label={`Color ${c}`}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none ${value === c ? "ring-2 ring-offset-2 ring-slate-400 dark:ring-slate-500 scale-110" : ""}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── EnvTagSelector ────────────────────────────────────────────────────────
function EnvTagSelector({ value, onChange, onColorSuggest }: {
  value: EnvTag; onChange: (t: EnvTag) => void; onColorSuggest: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ENV_TAGS.map(tag => (
        <button key={tag.value} type="button"
          onClick={() => { onChange(tag.value); onColorSuggest(ENV_TAG_DEFAULT_COLOR[tag.value]); }}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
            value === tag.value
              ? "bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900 dark:border-white"
              : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 dark:bg-transparent dark:text-slate-400 dark:border-[#2a2d3a] dark:hover:border-slate-500"
          }`}>{tag.label}</button>
      ))}
    </div>
  );
}

// ── MultiRegionPicker ─────────────────────────────────────────────────────
const REGION_GROUPS = [
  { label: "US East",      regions: ["us-east-1", "us-east-2"] },
  { label: "US West",      regions: ["us-west-1", "us-west-2"] },
  { label: "Asia Pacific", regions: ["ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2"] },
  { label: "Europe",       regions: ["eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-north-1"] },
  { label: "Other",        regions: ["sa-east-1", "ca-central-1", "me-south-1", "af-south-1"] },
];
function MultiRegionPicker({ value, onChange }: { value: string[]; onChange: (r: string[]) => void }) {
  const toggle = (region: string) => {
    if (value.includes(region)) { const n = value.filter(r => r !== region); if (n.length > 0) onChange(n); }
    else onChange([...value, region]);
  };
  return (
    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
      {REGION_GROUPS.map(group => (
        <div key={group.label}>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1">{group.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {group.regions.map(r => {
              const active = value.includes(r);
              return (
                <button key={r} type="button" onClick={() => toggle(r)}
                  className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
                    active ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#2a2d3a] hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400"
                  }`}>{r}</button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── TestBadge ─────────────────────────────────────────────────────────────
function TestBadge({ state }: { state: TestState }) {
  if (state.status === "idle") return null;
  if (state.status === "testing") return (
    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <RefreshCw size={14} className="animate-spin" /> Testing connection…
    </div>
  );
  if (state.status === "success" && state.result) return (
    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400 space-y-0.5">
      <div className="flex items-center gap-1.5 font-medium"><CheckCircle2 size={13} /> Connection successful</div>
      {state.result.account_id && <div className="pl-5 text-emerald-600 dark:text-emerald-500">Account: <span className="font-mono">{state.result.account_id}</span></div>}
      {state.result.arn && <div className="pl-5 text-emerald-600 dark:text-emerald-500 truncate">ARN: <span className="font-mono">{state.result.arn}</span></div>}
    </div>
  );
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
  return (
    <button onClick={async () => { try { await navigator.clipboard.writeText(error); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
      className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 underline hover:no-underline">
      {copied ? <ClipboardCheck size={14} /> : <Copy size={14} />}
      {copied ? "Copied!" : "Copy error details"}
    </button>
  );
}

// ── ResourceStat ──────────────────────────────────────────────────────────
function ResourceStat({ icon: Icon, count, label, color }: { icon: React.ElementType; count: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon size={13} style={{ color }} />
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{count}</span>
      <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">{label}</span>
    </div>
  );
}

// ── ProfileDetailModal ────────────────────────────────────────────────────
function ProfileDetailModal({
  profile, summary, testState, onClose, onTest,
}: {
  profile: Profile;
  summary: ProfileSummary | null;
  testState: TestState;
  onClose: () => void;
  onTest: () => void;
}) {
  const router = useRouter();
  const [r, g, b] = hexToRgb(profile.color);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const navigate = (path: string) => {
    onClose();
    router.push(path);
  };

  const SERVICE_LINKS = [
    {
      label: "EC2 Instances",
      icon: Server,
      color: "#3b82f6",
      count: summary?.ec2_count ?? null,
      href: `/?profile=${encodeURIComponent(profile.name)}`,
      description: "Virtual machines running in this account",
    },
    {
      label: "S3 Buckets",
      icon: HardDrive,
      color: "#f97316",
      count: summary?.s3_count ?? null,
      href: `/s3?profile=${encodeURIComponent(profile.name)}`,
      description: "Object storage buckets",
    },
    {
      label: "Lambda Functions",
      icon: Zap,
      color: "#a855f7",
      count: summary?.lambda_count ?? null,
      href: `/lambda?profile=${encodeURIComponent(profile.name)}`,
      description: "Serverless functions",
    },
    {
      label: "IAM Users",
      icon: Users,
      color: "#10b981",
      count: summary?.iam_user_count ?? null,
      href: `/iam?profile=${encodeURIComponent(profile.name)}`,
      description: "Identity & access management users",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog" aria-label={`${profile.name} details`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white dark:bg-[#161825] rounded-2xl border border-slate-200 dark:border-[#2a2d3a] shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Color strip */}
        <div className="h-1.5" style={{ backgroundColor: profile.color }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4" style={{ background: `linear-gradient(135deg, rgba(${r},${g},${b},0.1) 0%, transparent 100%)` }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <ProfileAvatar name={profile.name} color={profile.color} size="lg" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">{profile.name}</h2>
                  <EnvTagBadge tag={profile.env_tag} />
                </div>
                {profile.account_id && (
                  <p className="text-xs font-mono text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                    <BadgeCheck size={10} style={{ color: profile.color }} />
                    {profile.account_id}
                  </p>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {profile.regions.join(", ")}
                </p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-white/5 transition-colors shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Connection status bar */}
          <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-white/60 dark:bg-black/20 border border-slate-200/50 dark:border-white/5">
            <div className="text-xs">
              {testState.status === "testing" && (
                <span className="text-slate-500 flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin" /> Testing…</span>
              )}
              {testState.status === "success" && (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 size={11} /> Connected
                  {testState.testedAt && <span className="text-slate-400">· {relativeTime(testState.testedAt)}</span>}
                </span>
              )}
              {testState.status === "error" && (
                <span className="text-red-500 flex items-center gap-1.5">
                  <WifiOff size={11} /> {testState.result?.message ?? "Test failed"}
                </span>
              )}
              {testState.status === "idle" && <span className="text-slate-400">Connection not tested</span>}
            </div>
            <button onClick={onTest} disabled={testState.status === "testing"}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#2a2d3a] bg-white dark:bg-[#0f1117] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50">
              <Wifi size={11} /> Test
            </button>
          </div>
        </div>

        {/* Service links */}
        <div className="px-6 pb-6 space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Resources</p>
          {SERVICE_LINKS.map(({ label, icon: Icon, color, count, href, description }) => (
            <button key={label} onClick={() => navigate(href)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-[#2a2d3a] hover:border-slate-200 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-white/5 transition-all group text-left">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${color}20`, border: `1px solid ${color}30` }}>
                <Icon size={16} style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {count !== null && (
                  <span className="text-sm font-semibold px-2 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: color }}>{count}</span>
                )}
                <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ProfileForm ───────────────────────────────────────────────────────────
interface ProfileFormProps {
  mode: "add" | "edit";
  profileId?: number;
  initialValues: FormValues;
  onSuccess: (profile: Profile) => void;
  onClose: () => void;
  onTestResult?: (result: ConnectionTestResult) => void;
}
function ProfileForm({ mode, profileId, initialValues, onSuccess, onClose, onTestResult }: ProfileFormProps) {
  const [form, setForm] = useState<FormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  useEffect(() => { setForm(initialValues); setFormError(null); setTestState({ status: "idle" }); }, [initialValues]);

  const handleTest = async () => {
    const hasNewKeys = form.access_key.trim() && form.secret_key.trim();
    if (!hasNewKeys && mode === "edit" && profileId != null) {
      setTestState({ status: "testing" });
      try {
        const result = await testSavedProfile(profileId);
        setTestState({ status: result.ok ? "success" : "error", result, testedAt: Date.now() });
        onTestResult?.(result);
      } catch (e) {
        setTestState({ status: "error", result: { ok: false, message: e instanceof Error ? e.message : "Request failed" } });
      }
      return;
    }
    if (!hasNewKeys) { setTestState({ status: "error", result: { ok: false, message: "Enter Access Key and Secret Key first." } }); return; }
    setTestState({ status: "testing" });
    try {
      const result = await testConnection({ access_key: form.access_key, secret_key: form.secret_key, region: form.regions[0] });
      setTestState({ status: result.ok ? "success" : "error", result, testedAt: Date.now() });
      onTestResult?.(result);
    } catch (e) {
      setTestState({ status: "error", result: { ok: false, message: e instanceof Error ? e.message : "Request failed" } });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(null);
    if (!form.name.trim()) { setFormError("Profile name is required."); return; }
    if (mode === "add" && (!form.access_key.trim() || !form.secret_key.trim())) { setFormError("Access Key and Secret Key are required."); return; }
    setSubmitting(true);
    try {
      if (mode === "add") {
        onSuccess(await createProfile(form));
      } else {
        const patch: Partial<FormValues> = {};
        if (form.name !== initialValues.name) patch.name = form.name;
        if (JSON.stringify(form.regions) !== JSON.stringify(initialValues.regions)) patch.regions = form.regions;
        if (form.color !== initialValues.color) patch.color = form.color;
        if (form.env_tag !== initialValues.env_tag) patch.env_tag = form.env_tag;
        if (form.access_key.trim()) patch.access_key = form.access_key;
        if (form.secret_key.trim()) patch.secret_key = form.secret_key;
        if (Object.keys(patch).length === 0) { setFormError("No changes detected."); setSubmitting(false); return; }
        onSuccess(await updateProfile(profileId ?? 0, patch));
      }
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save profile");
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-[#0f1117] border border-slate-200 dark:border-[#2a2d3a] mb-4">
        <ProfileAvatar name={form.name || "?"} color={form.color} size="lg" />
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{form.name || "Profile name"}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {form.regions.join(", ") || "no regions"} · <EnvTagBadge tag={form.env_tag} />
          </p>
          {testState.status === "success" && testState.result?.account_id && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
              <BadgeCheck size={11} /> Account: <span className="font-mono">{testState.result.account_id}</span>
            </p>
          )}
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
          <EnvTagSelector value={form.env_tag} onChange={t => setForm(f => ({ ...f, env_tag: t }))}
            onColorSuggest={c => setForm(f => ({ ...f, color: c }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Regions <span className="ml-1 font-normal text-slate-400 dark:text-slate-600">({form.regions.length} selected)</span>
          </label>
          <MultiRegionPicker value={form.regions} onChange={r => setForm(f => ({ ...f, regions: r }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            AWS Access Key ID {mode === "edit" && <span className="ml-1 font-normal text-slate-400 dark:text-slate-600">(leave blank to keep current)</span>}
          </label>
          <input type="text" placeholder="AKIAIOSFODNN7EXAMPLE" value={form.access_key}
            onChange={e => { setForm(f => ({ ...f, access_key: e.target.value })); setTestState({ status: "idle" }); }}
            className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            AWS Secret Access Key {mode === "edit" && <span className="ml-1 font-normal text-slate-400 dark:text-slate-600">(leave blank to keep current)</span>}
          </label>
          <input type="password"
            placeholder={mode === "edit" ? "Leave blank to keep current" : "••••••••••••••••••••••••••••••••••••"}
            value={form.secret_key}
            onChange={e => { setForm(f => ({ ...f, secret_key: e.target.value })); setTestState({ status: "idle" }); }}
            className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Profile color <span className="ml-1 font-normal text-slate-400 dark:text-slate-600">(grouped by environment)</span>
          </label>
          <SemanticColorPicker value={form.color} onChange={c => setForm(f => ({ ...f, color: c }))} />
        </div>
        {formError && <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><AlertCircle size={14} /> {formError}</div>}
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
        <button type="button" onClick={onClose} className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">Cancel</button>
      </form>
    </>
  );
}

// ── ProfileCard (grid view, drag-and-drop enabled) ────────────────────────
interface ProfileCardProps {
  profile: Profile;
  testState: TestState;
  summary: ProfileSummary | null;
  summaryLoading: boolean;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
  confirmDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  deletingId: number | null;
  deleteError?: string;
  // drag
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}

function ProfileCard({
  profile, testState, summary, summaryLoading,
  onTest, onEdit, onDelete, onDetail,
  confirmDelete, onConfirmDelete, onCancelDelete, deletingId, deleteError,
  draggable, onDragStart, onDragOver, onDrop, onDragEnd, isDragOver,
}: ProfileCardProps) {
  const [r, g, b] = hexToRgb(profile.color);
  const accentStyle = { borderColor: isDragOver ? profile.color : `rgba(${r},${g},${b},0.35)` };
  const headerBg = { background: `linear-gradient(135deg, rgba(${r},${g},${b},0.12) 0%, rgba(${r},${g},${b},0.04) 100%)` };
  const cs = testState.status;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative bg-white dark:bg-[#161825] rounded-xl border overflow-hidden flex flex-col transition-all
        ${isDragOver ? "shadow-lg scale-[1.01]" : "hover:shadow-md dark:hover:shadow-slate-900/50"}
        ${draggable ? "cursor-default" : ""}`}
      style={accentStyle}
    >
      {/* Color strip */}
      <div className="h-1.5 w-full" style={{ backgroundColor: profile.color }} />

      {/* Drag handle */}
      {draggable && (
        <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
          title="Drag to reorder">
          <GripVertical size={14} className="text-slate-300 dark:text-slate-600" />
        </div>
      )}

      {/* Clickable header → opens detail modal */}
      <button onClick={onDetail} className="px-4 pt-4 pb-3 flex items-start gap-3 text-left hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors" style={headerBg}>
        <ProfileAvatar name={profile.name} color={profile.color} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{profile.name}</p>
            <EnvTagBadge tag={profile.env_tag} />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
            {profile.regions.slice(0, 2).join(", ")}{profile.regions.length > 2 && ` +${profile.regions.length - 2}`}
          </p>
          {profile.account_id && (
            <p className="text-xs font-mono text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
              <BadgeCheck size={10} style={{ color: profile.color }} />{profile.account_id}
            </p>
          )}
        </div>
        <ExternalLink size={12} className="text-slate-300 dark:text-slate-600 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      {/* Resource counts */}
      <div className="px-4 py-3 border-t border-slate-100 dark:border-[#2a2d3a]">
        {summaryLoading ? (
          <div className="flex justify-between">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-3 h-3 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
                <div className="w-5 h-3 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
                <div className="w-8 h-2.5 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
              </div>
            ))}
          </div>
        ) : summary ? (
          <div className="flex justify-between">
            <ResourceStat icon={Server}    count={summary.ec2_count}      label="EC2"    color="#3b82f6" />
            <ResourceStat icon={HardDrive} count={summary.s3_count}       label="S3"     color="#f97316" />
            <ResourceStat icon={Zap}       count={summary.lambda_count}   label="Lambda" color="#a855f7" />
            <ResourceStat icon={Users}     count={summary.iam_user_count} label="IAM"    color="#10b981" />
          </div>
        ) : (
          <p className="text-xs text-center text-slate-400 dark:text-slate-600">No cache data yet</p>
        )}
      </div>

      {/* Connection status */}
      <div className="px-4 py-2 border-t border-slate-100 dark:border-[#2a2d3a] flex items-center justify-between min-h-[36px]">
        {cs === "testing" && <span className="text-xs text-slate-400 flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin" /> Testing…</span>}
        {cs === "success" && <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={11} /> Connected {testState.testedAt && <span className="text-slate-400">· {relativeTime(testState.testedAt)}</span>}</span>}
        {cs === "error" && <span className="text-xs text-red-500 flex items-center gap-1.5 truncate max-w-[160px]" title={testState.result?.message}><WifiOff size={11} className="shrink-0" /><span className="truncate">{testState.result?.message ?? "Failed"}</span></span>}
        {cs === "idle" && <span className="text-xs text-slate-400 dark:text-slate-500">Never tested</span>}
        <button onClick={onTest} disabled={cs === "testing"} aria-label={`Test ${profile.name}`}
          className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-40">
          {cs === "testing" ? <RefreshCw size={13} className="animate-spin" /> : <Wifi size={13} />}
        </button>
      </div>

      {/* Actions footer */}
      <div className="px-4 py-2.5 border-t border-slate-100 dark:border-[#2a2d3a] flex items-center justify-between">
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs w-full">
            <span className="text-slate-600 dark:text-slate-300 flex-1">Delete this profile?</span>
            <button onClick={onConfirmDelete} disabled={deletingId === profile.id}
              className="px-2.5 py-1 bg-red-600 text-white rounded font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
              {deletingId === profile.id ? <RefreshCw size={11} className="animate-spin" /> : "Confirm"}
            </button>
            <button onClick={onCancelDelete} className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Cancel</button>
          </div>
        ) : (
          <>
            {deleteError && <p className="text-xs text-red-500 truncate flex-1">{deleteError}</p>}
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={onEdit} aria-label={`Edit ${profile.name}`} title="Edit"
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/30 transition-colors">
                <Pencil size={13} />
              </button>
              <button onClick={onDelete} aria-label={`Delete ${profile.name}`} title="Delete"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ProfileListRow (list view, drag-and-drop enabled) ─────────────────────
interface ProfileListRowProps {
  profile: Profile;
  testState: TestState;
  summary: ProfileSummary | null;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
  confirmDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  deletingId: number | null;
  deleteError?: string;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}
function ProfileListRow({
  profile, testState, summary,
  onTest, onEdit, onDelete, onDetail,
  confirmDelete, onConfirmDelete, onCancelDelete, deletingId, deleteError,
  draggable, onDragStart, onDragOver, onDrop, onDragEnd, isDragOver,
}: ProfileListRowProps) {
  const cs = testState.status;
  return (
    <li
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group px-5 py-3 transition-colors ${isDragOver ? "bg-blue-50/50 dark:bg-blue-950/20 border-l-2 border-blue-500" : "hover:bg-slate-50 dark:hover:bg-[#1c1f2e]"}`}
    >
      <div className="flex items-center gap-3">
        {/* Drag handle */}
        {draggable && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0">
            <GripVertical size={14} className="text-slate-300 dark:text-slate-600" />
          </div>
        )}

        {/* Avatar with status dot */}
        <div className="relative shrink-0">
          <ProfileAvatar name={profile.name} color={profile.color} size="md" />
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#161825]"
            style={{ backgroundColor: cs === "success" ? "#22c55e" : cs === "error" ? "#ef4444" : "#94a3b8" }} />
        </div>

        {/* Clickable name → detail */}
        <button onClick={onDetail} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{profile.name}</p>
            <EnvTagBadge tag={profile.env_tag} />
            {profile.account_id && (
              <span className="text-xs font-mono text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                <BadgeCheck size={10} style={{ color: profile.color }} />{profile.account_id}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {profile.regions.slice(0, 3).join(", ")}{profile.regions.length > 3 && ` +${profile.regions.length - 3}`}
            {testState.testedAt && cs === "success" && <span className="ml-2 text-emerald-500">· tested {relativeTime(testState.testedAt)}</span>}
            {cs === "error" && <span className="ml-2 text-red-400" title={testState.result?.message}>· test failed</span>}
          </p>
        </button>

        {/* Resource counts */}
        {summary && (
          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 shrink-0">
            <span className="flex items-center gap-1"><Server size={11} className="text-blue-400" />{summary.ec2_count}</span>
            <span className="flex items-center gap-1"><HardDrive size={11} className="text-orange-400" />{summary.s3_count}</span>
            <span className="flex items-center gap-1"><Zap size={11} className="text-purple-400" />{summary.lambda_count}</span>
            <span className="flex items-center gap-1"><Users size={11} className="text-emerald-400" />{summary.iam_user_count}</span>
          </div>
        )}

        {/* Actions */}
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs shrink-0">
            <span className="text-slate-600 dark:text-slate-300">Delete?</span>
            <button onClick={onConfirmDelete} disabled={deletingId === profile.id}
              className="px-2 py-1 bg-red-600 text-white rounded font-medium hover:bg-red-700 disabled:opacity-50">
              {deletingId === profile.id ? <RefreshCw size={11} className="animate-spin" /> : "Confirm"}
            </button>
            <button onClick={onCancelDelete} className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:text-slate-400">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onTest} disabled={cs === "testing"} aria-label={`Test ${profile.name}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-40">
              {cs === "testing" ? <RefreshCw size={14} className="animate-spin" /> :
               cs === "success" ? <CheckCircle2 size={14} className="text-emerald-500" /> :
               cs === "error"   ? <WifiOff size={14} className="text-red-500" /> : <Wifi size={14} />}
            </button>
            <button onClick={onEdit} aria-label={`Edit ${profile.name}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/30 transition-colors">
              <Pencil size={14} />
            </button>
            <button onClick={onDelete} aria-label={`Delete ${profile.name}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      {deleteError && <p className="mt-1 pl-12 text-xs text-red-500">{deleteError}</p>}
    </li>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="py-16 flex flex-col items-center gap-5 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
        <Server size={28} className="text-blue-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">No AWS profiles yet</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">
          Add your first AWS account to start monitoring EC2, S3, Lambda, and IAM resources.
        </p>
      </div>
      <div className="space-y-2 text-left bg-slate-50 dark:bg-[#0f1117] border border-slate-200 dark:border-[#2a2d3a] rounded-xl px-5 py-4 w-full max-w-xs">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Quick setup</p>
        {[
          { n: "1", text: "Create an IAM user with read-only policies" },
          { n: "2", text: "Generate an access key pair" },
          { n: "3", text: "Click Add Profile and paste your keys" },
        ].map(step => (
          <div key={step.n} className="flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 text-[10px] font-bold">{step.n}</span>
            {step.text}
          </div>
        ))}
      </div>
      <button onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
        <Plus size={14} /> Add your first profile
      </button>
    </div>
  );
}

// ── ProfilesPage ──────────────────────────────────────────────────────────
export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View / sort
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortKey, setSortKey] = useState<SortKey>("manual");

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add");
  const [drawerProfile, setDrawerProfile] = useState<Profile | null>(null);

  // Detail modal
  const [detailProfile, setDetailProfile] = useState<Profile | null>(null);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Test state (seeded from DB on load, kept live in-session)
  const [savedTests, setSavedTests] = useState<Record<number, TestState>>({});

  // Summaries
  const [summaries, setSummaries] = useState<Record<number, ProfileSummary>>({});
  const [summaryLoading, setSummaryLoading] = useState<Record<number, boolean>>({});

  // Search + pagination
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  // Bulk test
  const [bulkTesting, setBulkTesting] = useState(false);

  // Drag state
  const dragId = useRef<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchProfiles();
      setProfiles(data);
      setSavedTests(prev => {
        const next = { ...prev };
        data.forEach(p => {
          if (next[p.id]) return;
          if (p.last_tested_at) {
            next[p.id] = {
              status: p.last_test_ok ? "success" : "error",
              testedAt: new Date(p.last_tested_at).getTime(),
              result: p.last_test_ok
                ? { ok: true, account_id: p.account_id ?? undefined, message: "Connection successful" }
                : { ok: false, message: "Last test failed" },
            };
          }
        });
        return next;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load summaries when profiles change
  useEffect(() => {
    if (profiles.length === 0) return;
    profiles.forEach(p => {
      if (summaries[p.id] || summaryLoading[p.id]) return;
      setSummaryLoading(prev => ({ ...prev, [p.id]: true }));
      fetchProfileSummary(p.id)
        .then(s => setSummaries(prev => ({ ...prev, [p.id]: s })))
        .catch(() => {})
        .finally(() => setSummaryLoading(prev => ({ ...prev, [p.id]: false })));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

  // ── Drawer ────────────────────────────────────────────────────────────
  const openAddDrawer = () => { setDrawerMode("add"); setDrawerProfile(null); setDrawerOpen(true); };
  const openEditDrawer = (p: Profile) => { setDrawerMode("edit"); setDrawerProfile(p); setDrawerOpen(true); };
  const closeDrawer = () => setDrawerOpen(false);

  const handleFormSuccess = (profile: Profile) => {
    setProfiles(prev => {
      const exists = prev.find(p => p.id === profile.id);
      return exists
        ? prev.map(p => p.id === profile.id ? profile : p)
        : [...prev, profile];
    });
    setSummaries(prev => { const n = { ...prev }; delete n[profile.id]; return n; });
    setSummaryLoading(prev => ({ ...prev, [profile.id]: true }));
    fetchProfileSummary(profile.id)
      .then(s => setSummaries(prev => ({ ...prev, [profile.id]: s })))
      .finally(() => setSummaryLoading(prev => ({ ...prev, [profile.id]: false })));
    closeDrawer();
  };

  const handleFormTestResult = (result: ConnectionTestResult) => {
    if (drawerMode === "edit" && drawerProfile && result.ok && result.account_id) {
      setProfiles(prev => prev.map(p =>
        p.id === drawerProfile.id ? { ...p, account_id: result.account_id } : p
      ));
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteProfile(id);
      setProfiles(prev => prev.filter(p => p.id !== id));
      setSummaries(prev => { const n = { ...prev }; delete n[id]; return n; });
      setSavedTests(prev => { const n = { ...prev }; delete n[id]; return n; });
      setConfirmDeleteId(null);
    } catch (e) {
      setDeleteErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : "Failed to delete" }));
      setConfirmDeleteId(null);
    } finally { setDeletingId(null); }
  };

  // ── Test ──────────────────────────────────────────────────────────────
  const handleTestSaved = async (id: number) => {
    setSavedTests(prev => ({ ...prev, [id]: { status: "testing" } }));
    try {
      const result = await testSavedProfile(id);
      setSavedTests(prev => ({ ...prev, [id]: { status: result.ok ? "success" : "error", result, testedAt: Date.now() } }));
      if (result.ok && result.account_id) {
        setProfiles(prev => prev.map(p => p.id === id ? { ...p, account_id: result.account_id } : p));
      }
    } catch (e) {
      setSavedTests(prev => ({ ...prev, [id]: { status: "error", result: { ok: false, message: e instanceof Error ? e.message : "Request failed" } } }));
    }
  };
  const handleBulkTest = async () => {
    setBulkTesting(true);
    await Promise.allSettled(profiles.map(p => handleTestSaved(p.id)));
    setBulkTesting(false);
  };

  // ── Drag-and-drop reorder ─────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, id: number) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  };
  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = dragId.current;
    if (sourceId == null || sourceId === targetId) return;
    setProfiles(prev => {
      const next = [...prev];
      const fromIdx = next.findIndex(p => p.id === sourceId);
      const toIdx = next.findIndex(p => p.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      // Persist to backend (fire-and-forget)
      reorderProfiles(next.map(p => p.id)).catch(() => {});
      return next;
    });
    dragId.current = null;
  };
  const handleDragEnd = () => { dragId.current = null; setDragOverId(null); };

  // ── Sort + filter ─────────────────────────────────────────────────────
  const filtered = profiles.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.regions.some(r => r.toLowerCase().includes(search.toLowerCase())) ||
    p.env_tag.toLowerCase().includes(search.toLowerCase())
  );
  const sorted = sortKey === "manual" ? filtered : [...filtered].sort((a, b) => {
    if (sortKey === "name") return a.name.localeCompare(b.name);
    if (sortKey === "env") return a.env_tag.localeCompare(b.env_tag);
    if (sortKey === "regions") return a.regions.length - b.regions.length;
    if (sortKey === "tested") return (savedTests[b.id]?.testedAt ?? 0) - (savedTests[a.id]?.testedAt ?? 0);
    return 0;
  });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  // Dragging only works when in manual sort order (no search active)
  const canDrag = sortKey === "manual" && !search.trim();

  const drawerInitialValues: FormValues = drawerProfile
    ? { name: drawerProfile.name, access_key: "", secret_key: "", regions: drawerProfile.regions, color: drawerProfile.color, env_tag: drawerProfile.env_tag }
    : { ...EMPTY_FORM };

  const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: "manual",  label: "Manual order" },
    { value: "name",    label: "Name" },
    { value: "env",     label: "Environment" },
    { value: "regions", label: "Regions" },
    { value: "tested",  label: "Last Tested" },
  ];

  const sharedCardProps = (profile: Profile) => ({
    profile,
    testState: savedTests[profile.id] ?? { status: "idle" as TestStatus },
    summary: summaries[profile.id] ?? null,
    onTest: () => handleTestSaved(profile.id),
    onEdit: () => openEditDrawer(profile),
    onDelete: () => setConfirmDeleteId(profile.id),
    onDetail: () => setDetailProfile(profile),
    confirmDelete: confirmDeleteId === profile.id,
    onConfirmDelete: () => handleDelete(profile.id),
    onCancelDelete: () => { setConfirmDeleteId(null); setDeleteErrors(e => { const n = { ...e }; delete n[profile.id]; return n; }); },
    deletingId,
    deleteError: deleteErrors[profile.id],
    draggable: canDrag,
    onDragStart: (e: React.DragEvent) => handleDragStart(e, profile.id),
    onDragOver: (e: React.DragEvent) => handleDragOver(e, profile.id),
    onDrop: (e: React.DragEvent) => handleDrop(e, profile.id),
    onDragEnd: handleDragEnd,
    isDragOver: dragOverId === profile.id,
  });

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-screen">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">AWS Profiles</h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
              Manage the AWS accounts this dashboard connects to
            </p>
          </div>
          <button onClick={openAddDrawer}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white shrink-0">
            <Plus size={14} /> Add Profile
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input type="text" placeholder="Search by name, region, or environment…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full bg-white dark:bg-[#161825] border border-slate-200 dark:border-[#2a2d3a] rounded-lg pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors" />
          </div>

          <div className="flex items-center gap-1.5 bg-white dark:bg-[#161825] border border-slate-200 dark:border-[#2a2d3a] rounded-lg px-2.5 py-1.5">
            <ArrowUpDown size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
            <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
              className="text-xs text-slate-600 dark:text-slate-300 bg-transparent focus:outline-none cursor-pointer">
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="flex items-center border border-slate-200 dark:border-[#2a2d3a] rounded-lg overflow-hidden">
            {([["grid", LayoutGrid], ["list", List]] as [ViewMode, React.ElementType][]).map(([mode, Icon]) => (
              <button key={mode} onClick={() => setViewMode(mode)} aria-label={`${mode} view`}
                className={`px-2.5 py-1.5 transition-colors ${viewMode === mode ? "bg-blue-600 text-white" : "bg-white dark:bg-[#161825] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}>
                <Icon size={14} />
              </button>
            ))}
          </div>

          {!loading && profiles.length > 0 && (
            <button onClick={handleBulkTest} disabled={bulkTesting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-[#2a2d3a] rounded-lg bg-white dark:bg-[#161825] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50 whitespace-nowrap">
              {bulkTesting ? <><RefreshCw size={12} className="animate-spin" /> Testing all…</> : <><TestTube2 size={12} /> Test all</>}
            </button>
          )}

          {!loading && !error && filtered.length > pageSize && (
            <Pagination total={filtered.length} page={page} pageSize={pageSize}
              onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />
          )}
        </div>

        {/* Drag hint */}
        {canDrag && profiles.length > 1 && (
          <p className="text-xs text-slate-400 dark:text-slate-600 flex items-center gap-1.5">
            <GripVertical size={11} /> Drag cards to reorder — order is saved automatically
          </p>
        )}

        {/* Content */}
        {loading ? (
          <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "bg-white dark:bg-[#161825] rounded-xl border border-slate-200 dark:border-[#2a2d3a] overflow-hidden"}>
            {Array.from({ length: 3 }, (_, i) =>
              viewMode === "grid" ? (
                <div key={i} className="bg-white dark:bg-[#161825] rounded-xl border border-slate-200 dark:border-[#2a2d3a] overflow-hidden">
                  <div className="h-1.5 w-full animate-pulse bg-slate-200 dark:bg-slate-700" />
                  <div className="p-4 flex items-start gap-3">
                    <div className="w-11 h-11 rounded-full animate-pulse bg-slate-200 dark:bg-slate-700 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="w-28 h-3.5 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
                      <div className="w-20 h-3 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
                    </div>
                  </div>
                  <div className="px-4 py-3 border-t border-slate-100 dark:border-[#2a2d3a] flex justify-between">
                    {[...Array(4)].map((_, j) => <div key={j} className="w-8 h-8 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />)}
                  </div>
                </div>
              ) : (
                <div key={i} className="px-5 py-4 border-b border-slate-100 dark:border-[#2a2d3a] flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full animate-pulse bg-slate-200 dark:bg-slate-700" />
                  <div className="space-y-1.5">
                    <div className="w-32 h-3.5 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
                    <div className="w-20 h-3 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
                  </div>
                </div>
              )
            )}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/20 p-6 text-red-600 dark:text-red-400">
            <p className="font-semibold mb-1">Failed to load profiles</p>
            <p className="text-sm font-mono opacity-80 mb-3">{error}</p>
            <div className="flex items-center gap-3">
              <CopyErrorButton error={error} />
              <button onClick={() => load()} className="text-sm underline hover:no-underline">Try again</button>
            </div>
          </div>
        ) : profiles.length === 0 ? (
          <div className="bg-white dark:bg-[#161825] rounded-xl border border-slate-200 dark:border-[#2a2d3a] overflow-hidden">
            <EmptyState onAdd={openAddDrawer} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-[#161825] rounded-xl border border-slate-200 dark:border-[#2a2d3a] py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            No profiles match &ldquo;{search}&rdquo;.
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map(profile => (
              <ProfileCard key={profile.id} {...sharedCardProps(profile)} summaryLoading={!!summaryLoading[profile.id]} />
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#161825] rounded-xl border border-slate-200 dark:border-[#2a2d3a] overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-[#2a2d3a]">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {search.trim() ? `${filtered.length} result${filtered.length === 1 ? "" : "s"}` : `Saved profiles (${profiles.length})`}
              </h3>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
              {paginated.map(profile => (
                <ProfileListRow key={profile.id} {...sharedCardProps(profile)} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Add / Edit drawer */}
      <SlideOverDrawer isOpen={drawerOpen} onClose={closeDrawer}
        title={drawerMode === "add" ? "Add AWS Profile" : `Edit · ${drawerProfile?.name ?? ""}`}>
        <ProfileForm mode={drawerMode} profileId={drawerProfile?.id}
          initialValues={drawerInitialValues} onSuccess={handleFormSuccess}
          onClose={closeDrawer} onTestResult={handleFormTestResult} />
      </SlideOverDrawer>

      {/* Profile detail modal */}
      {detailProfile && (
        <ProfileDetailModal
          profile={detailProfile}
          summary={summaries[detailProfile.id] ?? null}
          testState={savedTests[detailProfile.id] ?? { status: "idle" }}
          onClose={() => setDetailProfile(null)}
          onTest={() => handleTestSaved(detailProfile.id)}
        />
      )}
    </div>
  );
}
