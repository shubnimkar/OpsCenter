"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  RefreshCw, Users, Shield, UserCheck, Key, ChevronDown, ChevronUp,
  ChevronsUpDown, Copy, Check, X, Search,
  ShieldCheck, ShieldOff, Lock, Unlock, FileText, Activity,
} from "lucide-react";
import {
  fetchIAMUsers, fetchIAMRoles, fetchIAMGroups,
  triggerSchedulerPoll,
} from "@/lib/api";
import { useResourceLoad } from "@/lib/useInitialFetch";
import { IAMUser, IAMRole, IAMGroup, InlinePolicy, AccessKeyDetail } from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import ProfileBadge from "./ProfileBadge";
import Pagination, { PageSize } from "./Pagination";
import SlideOverDrawer from "./SlideOverDrawer";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function ageLabel(iso: string | null): string {
  const d = daysAgo(iso);
  if (d === null) return "—";
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function ageBadgeColor(iso: string | null, warnDays = 90, dangerDays = 180): string {
  const d = daysAgo(iso);
  if (d === null) return "text-slate-400 dark:text-slate-500";
  if (d >= dangerDays) return "text-red-500 dark:text-red-400";
  if (d >= warnDays)  return "text-amber-500 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

// ── CopyButton ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1.5 transition-opacity text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

// ── DropdownChip ───────────────────────────────────────────────────────────

interface DropdownChipProps {
  label: string;
  allItems: string[];
  selectedItems: string[];
  onChange: (items: string[]) => void;
  renderItem?: (item: string) => React.ReactNode;
}

function DropdownChip({ label, allItems, selectedItems, onChange, renderItem }: DropdownChipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allSelected = selectedItems.length === 0 || selectedItems.length === allItems.length;
  const activeCount = selectedItems.length > 0 && selectedItems.length < allItems.length
    ? selectedItems.length : null;

  const toggle = (item: string) => {
    if (selectedItems.includes(item)) onChange(selectedItems.filter((x) => x !== item));
    else onChange([...selectedItems, item]);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors
          ${activeCount !== null
            ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-600/15 dark:text-blue-300"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
          }`}
      >
        {label}
        {activeCount !== null && (
          <span className="rounded-full bg-blue-500 text-white text-xs w-4 h-4 flex items-center justify-center leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 min-w-[180px] rounded-xl border border-slate-200 bg-white shadow-lg dark:border-[#2a2d3a] dark:bg-[#161825]">
          <div className="flex items-center gap-3 px-3 pt-2 pb-1.5 border-b border-slate-100 dark:border-[#2a2d3a]">
            <button type="button" onClick={() => onChange([])} className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400">Select all</button>
            <button type="button" onClick={() => onChange([])} className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500">Clear</button>
          </div>
          <ul className="py-1 max-h-56 overflow-y-auto">
            {allItems.map((item) => (
              <li key={item}>
                <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                  <input type="checkbox" checked={allSelected ? true : selectedItems.includes(item)} onChange={() => toggle(item)} className="accent-blue-500 w-3.5 h-3.5 shrink-0" />
                  {renderItem ? renderItem(item) : <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{item}</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Pill badge ─────────────────────────────────────────────────────────────

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

// ── Access Keys Section ────────────────────────────────────────────────────

function AccessKeysSection({ keys }: { keys: AccessKeyDetail[] }) {
  if (!keys || keys.length === 0) return (
    <div>
      <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
        <Key size={11} /> Access Keys
      </p>
      <p className="text-xs text-slate-400 italic">No access keys</p>
    </div>
  );

  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
        <Key size={11} /> Access Keys ({keys.length})
      </p>
      <div className="space-y-3">
        {keys.map((k) => (
          <div key={k.access_key_id}
            className="rounded-lg border border-slate-200 dark:border-[#2a2d3a] overflow-hidden">
            {/* Key header */}
            <div className={`flex items-center justify-between px-3 py-2 ${
              k.status === "Active"
                ? "bg-emerald-50 dark:bg-emerald-950/20"
                : "bg-slate-50 dark:bg-[#161825]"
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${k.status === "Active" ? "bg-emerald-500" : "bg-slate-400"}`} />
                <span className="font-mono text-xs text-slate-700 dark:text-slate-200 truncate">{k.access_key_id}</span>
                <CopyButton text={k.access_key_id} />
              </div>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                k.status === "Active"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
              }`}>{k.status}</span>
            </div>
            {/* Key details */}
            <dl className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
              <div className="flex justify-between px-3 py-1.5 gap-4">
                <dt className="text-slate-500 dark:text-slate-400 text-xs shrink-0">Key age</dt>
                <dd className={`text-xs font-medium text-right ${ageBadgeColor(k.created_at, 180, 365)}`}>
                  {k.created_at ? (
                    <span title={formatDateTime(k.created_at)}>{ageLabel(k.created_at)} · {formatDate(k.created_at)}</span>
                  ) : "—"}
                </dd>
              </div>
              <div className="flex justify-between px-3 py-1.5 gap-4">
                <dt className="text-slate-500 dark:text-slate-400 text-xs shrink-0">Last used</dt>
                <dd className={`text-xs text-right ${ageBadgeColor(k.last_used_date, 90, 180)}`}>
                  {k.last_used_date ? (
                    <span title={formatDateTime(k.last_used_date)}>{ageLabel(k.last_used_date)} · {formatDate(k.last_used_date)}</span>
                  ) : <span className="text-slate-400">Never</span>}
                </dd>
              </div>
              {(k.last_used_service || k.last_used_region) && (
                <div className="flex justify-between px-3 py-1.5 gap-4">
                  <dt className="text-slate-500 dark:text-slate-400 text-xs shrink-0">Last used via</dt>
                  <dd className="text-xs text-slate-600 dark:text-slate-300 text-right">
                    {[k.last_used_service, k.last_used_region].filter(Boolean).join(" · ")}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inline Policies Section ────────────────────────────────────────────────

function InlinePoliciesSection({ policies }: { policies: InlinePolicy[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
        <FileText size={11} />
        Inline Policies ({policies.length})
      </p>
      <div className="space-y-2">
        {policies.map((policy) => {
          const isOpen = expanded === policy.name;
          const docJson = JSON.stringify(policy.document, null, 2);
          return (
            <div key={policy.name} className="rounded-lg border border-slate-200 dark:border-[#2a2d3a] overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : policy.name)}
                className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  {policy.name}
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <CopyButton text={docJson} />
                  {isOpen
                    ? <ChevronUp size={13} className="text-amber-500" />
                    : <ChevronDown size={13} />}
                </span>
              </button>
              {isOpen && (
                <div className="relative">
                  {Object.keys(policy.document).length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400 italic">Policy document unavailable</p>
                  ) : (
                    <pre className="px-3 py-2 text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#161825] overflow-x-auto max-h-72 leading-relaxed whitespace-pre-wrap break-words">
                      {docJson}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── User Detail Drawer ─────────────────────────────────────────────────────

function UserDrawer({ user, onClose }: { user: IAMUser | null; onClose: () => void }) {
  return (
    <SlideOverDrawer isOpen={!!user} onClose={onClose} title={user ? `User: ${user.Username}` : ""}>
      {user && (
        <div className="space-y-6 text-sm">

          {/* Identity */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Identity</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Username</dt>
                <dd className="text-slate-800 dark:text-slate-100 font-medium text-right truncate">{user.Username}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">User ID</dt>
                <dd className="font-mono text-xs text-slate-600 dark:text-slate-300 text-right break-all">{user.UserId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Path</dt>
                <dd className="font-mono text-xs text-slate-600 dark:text-slate-300">{user.Path}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Created</dt>
                <dd className="text-slate-800 dark:text-slate-100">{formatDate(user.CreatedAt)}</dd>
              </div>
            </dl>
          </div>

          {/* ARN */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">ARN</p>
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-white/5 rounded-lg px-3 py-2">
              <span className="font-mono text-xs text-slate-600 dark:text-slate-300 break-all flex-1">{user.Arn}</span>
              <CopyButton text={user.Arn} />
            </div>
          </div>

          {/* Activity */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
              <Activity size={11} /> Activity
            </p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Last activity</dt>
                <dd className={`text-right font-medium text-xs ${ageBadgeColor(user.LastActivity, 90, 180)}`}>
                  {user.LastActivity
                    ? <span title={formatDateTime(user.LastActivity)}>{ageLabel(user.LastActivity)} · {formatDate(user.LastActivity)}</span>
                    : <span className="text-slate-400">Never</span>}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Last console sign-in</dt>
                <dd className="text-slate-600 dark:text-slate-300 text-right text-xs">
                  {user.PasswordLastUsed
                    ? <span title={formatDateTime(user.PasswordLastUsed)}>{ageLabel(user.PasswordLastUsed)} · {formatDate(user.PasswordLastUsed)}</span>
                    : <span className="text-slate-400">Never</span>}
                </dd>
              </div>
            </dl>
          </div>

          {/* Console & Password */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Console Access</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Console access</dt>
                <dd>{user.ConsoleAccess
                  ? <Pill label="Enabled" color="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" />
                  : <Pill label="Disabled" color="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" />}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">MFA</dt>
                <dd>{user.MfaEnabled
                  ? <Pill label="Enabled" color="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" />
                  : <Pill label="Not enabled" color="bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400" />}
                </dd>
              </div>
              {user.ConsoleAccess && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400 shrink-0">Password age</dt>
                  <dd className={`text-xs font-medium text-right ${ageBadgeColor(user.PasswordCreatedAt, 90, 180)}`}>
                    {user.PasswordCreatedAt
                      ? <span title={formatDate(user.PasswordCreatedAt)}>{ageLabel(user.PasswordCreatedAt)}</span>
                      : <span className="text-slate-400">—</span>}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Access Keys */}
          <AccessKeysSection keys={user.AccessKeysDetail ?? []} />

          {/* Groups */}
          {user.Groups.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Groups ({user.Groups.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {user.Groups.map((g) => (
                  <span key={g} className="px-2 py-0.5 rounded-full text-xs bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{g}</span>
                ))}
              </div>
            </div>
          )}

          {/* Attached Policies */}
          {user.AttachedPolicies.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Attached Policies ({user.AttachedPolicies.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {user.AttachedPolicies.map((p) => (
                  <span key={p} className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Inline Policies */}
          {user.InlinePolicies && user.InlinePolicies.length > 0 && (
            <InlinePoliciesSection policies={user.InlinePolicies} />
          )}

        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Role Detail Drawer ─────────────────────────────────────────────────────

function RoleDrawer({ role, onClose }: { role: IAMRole | null; onClose: () => void }) {
  return (
    <SlideOverDrawer isOpen={!!role} onClose={onClose} title={role ? `Role: ${role.RoleName}` : ""}>
      {role && (
        <div className="space-y-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Identity</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Role name</dt>
                <dd className="text-slate-800 dark:text-slate-100 font-medium text-right">{role.RoleName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Role ID</dt>
                <dd className="font-mono text-xs text-slate-600 dark:text-slate-300 text-right">{role.RoleId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Path</dt>
                <dd className="font-mono text-xs text-slate-600 dark:text-slate-300">{role.Path}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Max session</dt>
                <dd className="text-slate-800 dark:text-slate-100">{Math.round(role.MaxSessionDuration / 3600)}h</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Created</dt>
                <dd className="text-slate-800 dark:text-slate-100">{formatDate(role.CreatedAt)}</dd>
              </div>
            </dl>
          </div>
          {role.Description && (
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Description</p>
              <p className="text-slate-600 dark:text-slate-300 text-sm">{role.Description}</p>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">ARN</p>
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-white/5 rounded-lg px-3 py-2">
              <span className="font-mono text-xs text-slate-600 dark:text-slate-300 break-all flex-1">{role.Arn}</span>
              <CopyButton text={role.Arn} />
            </div>
          </div>
          {role.TrustedServices.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Trusted Services ({role.TrustedServices.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {role.TrustedServices.map((s) => (
                  <span key={s} className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{s}</span>
                ))}
              </div>
            </div>
          )}
          {role.AttachedPolicies.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Attached Policies ({role.AttachedPolicies.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {role.AttachedPolicies.map((p) => (
                  <span key={p} className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Users Table ────────────────────────────────────────────────────────────

type UserSortKey = "Username" | "Profile" | "CreatedAt" | "PasswordLastUsed" | "AccessKeyCount" | "LastActivity";
type SortDir = "asc" | "desc";

const USER_COLS: { key: UserSortKey; label: string }[] = [
  { key: "Username",         label: "Username" },
  { key: "Profile",          label: "Profile" },
  { key: "LastActivity",     label: "Last Activity" },
  { key: "PasswordLastUsed", label: "Last Sign-in" },
  { key: "AccessKeyCount",   label: "Keys" },
];

function UsersTable({
  users, loading, onClearFilters, hasActiveFilters, page, pageSize, onRowClick,
}: {
  users: IAMUser[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize;
  onRowClick: (u: IAMUser) => void;
}) {
  const [sortKey, setSortKey] = useState<UserSortKey>("Username");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (k: UserSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const sorted = [...users].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    if (sortKey === "AccessKeyCount") {
      const cmp = Number(av) - Number(bv);
      return sortDir === "asc" ? cmp : -cmp;
    }
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const SortIcon = ({ col }: { col: UserSortKey }) => {
    if (col !== sortKey) return <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc" ? <ChevronUp size={13} className="text-blue-500" /> : <ChevronDown size={13} className="text-blue-500" />;
  };

  if (!loading && sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-lg font-medium text-slate-600 dark:text-slate-300">
          {hasActiveFilters ? "No users match the current filters." : "No IAM users found"}
        </p>
        {hasActiveFilters && (
          <button onClick={onClearFilters} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors">
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {USER_COLS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300">
                  <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">Security</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">Permissions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />)
              : paginated.map((user) => {
                  const managedCount = user.AttachedPolicies.length;
                  const inlineCount = user.InlinePolicies?.length ?? 0;
                  const totalPolicies = managedCount + inlineCount;
                  return (
                    <tr key={`${user.Profile}:${user.Username}`}
                      onClick={() => onRowClick(user)}
                      className="group bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538] cursor-pointer">
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap dark:text-slate-100">
                        <span className="inline-flex items-center gap-1">
                          {user.Username}
                          <CopyButton text={user.Username} />
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ProfileBadge profile={user.Profile} color={user.ProfileColor} envTag={user.ProfileEnvTag} />
                      </td>
                      {/* Last Activity */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {user.LastActivity ? (
                          <span title={formatDateTime(user.LastActivity)}
                            className={`text-xs font-medium ${ageBadgeColor(user.LastActivity, 90, 180)}`}>
                            {ageLabel(user.LastActivity)}
                          </span>
                        ) : <span className="text-xs text-slate-400">Never</span>}
                      </td>
                      {/* Last Sign-in */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {user.PasswordLastUsed ? (
                          <span title={formatDateTime(user.PasswordLastUsed)}
                            className="text-xs text-slate-500 dark:text-slate-400">
                            {ageLabel(user.PasswordLastUsed)}
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      {/* Keys */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {user.AccessKeyCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                            <Key size={12} />
                            {user.ActiveKeyCount}/{user.AccessKeyCount}
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {user.MfaEnabled
                            ? <span title="MFA enabled" className="text-emerald-500"><ShieldCheck size={15} /></span>
                            : <span title="MFA not enabled" className="text-red-400"><ShieldOff size={15} /></span>}
                          {user.ConsoleAccess
                            ? <span title="Console access" className="text-slate-400 dark:text-slate-500"><Unlock size={14} /></span>
                            : <span title="No console access" className="text-slate-300 dark:text-slate-700"><Lock size={14} /></span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {totalPolicies > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {managedCount > 0 && (
                              <span title={`${managedCount} managed polic${managedCount !== 1 ? "ies" : "y"}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-medium">
                                {managedCount} managed
                              </span>
                            )}
                            {inlineCount > 0 && (
                              <span title={`${inlineCount} inline polic${inlineCount !== 1 ? "ies" : "y"}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-medium">
                                {inlineCount} inline
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Roles Table ────────────────────────────────────────────────────────────

type RoleSortKey = "RoleName" | "Profile" | "CreatedAt" | "MaxSessionDuration";

const ROLE_COLS: { key: RoleSortKey; label: string }[] = [
  { key: "RoleName",           label: "Role Name" },
  { key: "Profile",            label: "Profile" },
  { key: "CreatedAt",          label: "Created" },
  { key: "MaxSessionDuration", label: "Max Session" },
];

function RolesTable({
  roles, loading, onClearFilters, hasActiveFilters, page, pageSize, onRowClick,
}: {
  roles: IAMRole[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize;
  onRowClick: (r: IAMRole) => void;
}) {
  const [sortKey, setSortKey] = useState<RoleSortKey>("RoleName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (k: RoleSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const sorted = [...roles].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    if (sortKey === "MaxSessionDuration") {
      const cmp = Number(av) - Number(bv);
      return sortDir === "asc" ? cmp : -cmp;
    }
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const SortIcon = ({ col }: { col: RoleSortKey }) => {
    if (col !== sortKey) return <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc" ? <ChevronUp size={13} className="text-blue-500" /> : <ChevronDown size={13} className="text-blue-500" />;
  };

  if (!loading && sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-lg font-medium text-slate-600 dark:text-slate-300">
          {hasActiveFilters ? "No roles match the current filters." : "No IAM roles found"}
        </p>
        {hasActiveFilters && (
          <button onClick={onClearFilters} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors">
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {ROLE_COLS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300">
                  <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">Trusted Services</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={5} />)
              : paginated.map((role) => {
                  return (
                    <tr key={`${role.Profile}:${role.RoleName}`}
                      onClick={() => onRowClick(role)}
                      className="group bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538] cursor-pointer">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 w-[260px] max-w-[260px]">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="truncate text-sm" title={role.RoleName}>{role.RoleName}</span>
                          <CopyButton text={role.RoleName} />
                        </div>
                        {role.Description && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate font-normal mt-0.5">{role.Description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ProfileBadge profile={role.Profile} color={role.ProfileColor} envTag={role.ProfileEnvTag} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap dark:text-slate-400 text-xs">{formatDate(role.CreatedAt)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap dark:text-slate-400 text-xs">
                        {Math.round(role.MaxSessionDuration / 3600)}h
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {role.TrustedServices.slice(0, 2).map((s) => (
                            <span key={s} className="px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 truncate max-w-[120px]" title={s}>
                              {s.replace(".amazonaws.com", "")}
                            </span>
                          ))}
                          {role.TrustedServices.length > 2 && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              +{role.TrustedServices.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Groups Table ───────────────────────────────────────────────────────────

type GroupSortKey = "GroupName" | "Profile" | "MemberCount" | "CreatedAt";

const GROUP_COLS: { key: GroupSortKey; label: string }[] = [
  { key: "GroupName",   label: "Group Name" },
  { key: "Profile",     label: "Profile" },
  { key: "MemberCount", label: "Members" },
  { key: "CreatedAt",   label: "Created" },
];

function GroupsTable({
  groups, loading, onClearFilters, hasActiveFilters, page, pageSize,
}: {
  groups: IAMGroup[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize;
}) {
  const [sortKey, setSortKey] = useState<GroupSortKey>("GroupName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (k: GroupSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const sorted = [...groups].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    if (sortKey === "MemberCount") {
      const cmp = Number(av) - Number(bv);
      return sortDir === "asc" ? cmp : -cmp;
    }
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const SortIcon = ({ col }: { col: GroupSortKey }) => {
    if (col !== sortKey) return <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc" ? <ChevronUp size={13} className="text-blue-500" /> : <ChevronDown size={13} className="text-blue-500" />;
  };

  if (!loading && sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-lg font-medium text-slate-600 dark:text-slate-300">
          {hasActiveFilters ? "No groups match the current filters." : "No IAM groups found"}
        </p>
        {hasActiveFilters && (
          <button onClick={onClearFilters} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors">
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {GROUP_COLS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300">
                  <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">Policies</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={5} />)
              : paginated.map((group) => {
                  return (
                    <tr key={`${group.Profile}:${group.GroupName}`}
                      className="bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538]">
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap dark:text-slate-100">
                        <span className="inline-flex items-center gap-1">
                          {group.GroupName}
                          <CopyButton text={group.GroupName} />
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ProfileBadge profile={group.Profile} color={group.ProfileColor} envTag={group.ProfileEnvTag} />
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap dark:text-slate-300 text-sm font-medium">
                        {group.MemberCount}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap dark:text-slate-400 text-xs">
                        {formatDate(group.CreatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {group.AttachedPolicies.slice(0, 3).map((p) => (
                            <span key={p} className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 truncate max-w-[140px]" title={p}>{p}</span>
                          ))}
                          {group.AttachedPolicies.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">+{group.AttachedPolicies.length - 3}</span>
                          )}
                          {group.AttachedPolicies.length === 0 && <span className="text-xs text-slate-400">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── IAMDashboard (main) ────────────────────────────────────────────────────

type ActiveTab = "users" | "roles" | "groups";

export default function IAMDashboard() {
  const [users,  setUsers]  = useState<IAMUser[]>([]);
  const [roles,  setRoles]  = useState<IAMRole[]>([]);
  const [groups, setGroups] = useState<IAMGroup[]>([]);

  const beforeRefresh = useCallback(async () => {
    await triggerSchedulerPoll();
    await new Promise((r) => setTimeout(r, 2000));
  }, []);

  const fetchIamData = useCallback(
    () => Promise.all([fetchIAMUsers(), fetchIAMRoles(), fetchIAMGroups()]),
    [],
  );

  const onIamData = useCallback(([u, r, g]: [IAMUser[], IAMRole[], IAMGroup[]]) => {
    setUsers(u);
    setRoles(r);
    setGroups(g);
  }, []);

  const { loading, error, lastUpdated, refreshing, load } = useResourceLoad({
    fetcher: fetchIamData,
    onData: onIamData,
    beforeRefresh,
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>("users");
  const [selectedUser, setSelectedUser] = useState<IAMUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<IAMRole | null>(null);

  // Per-tab filter state
  const [userSearch,    setUserSearch]    = useState("");
  const [userProfiles,  setUserProfiles]  = useState<string[]>([]);
  const [userPage,      setUserPage]      = useState(1);
  const [userPageSize,  setUserPageSize]  = useState<PageSize>(10);

  const [roleSearch,    setRoleSearch]    = useState("");
  const [roleProfiles,  setRoleProfiles]  = useState<string[]>([]);
  const [rolePage,      setRolePage]      = useState(1);
  const [rolePageSize,  setRolePageSize]  = useState<PageSize>(10);

  const [groupSearch,   setGroupSearch]   = useState("");
  const [groupProfiles, setGroupProfiles] = useState<string[]>([]);
  const [groupPage,     setGroupPage]     = useState(1);
  const [groupPageSize, setGroupPageSize] = useState<PageSize>(10);

  // ── Derived ──────────────────────────────────────────────────────────────
  const allUserProfiles  = [...new Set(users.map((u) => u.Profile))].sort();
  const allRoleProfiles  = [...new Set(roles.map((r) => r.Profile))].sort();
  const allGroupProfiles = [...new Set(groups.map((g) => g.Profile))].sort();

  const userColorMap  = Object.fromEntries(users.map((u) => [u.Profile, u.ProfileColor]));
  const roleColorMap  = Object.fromEntries(roles.map((r) => [r.Profile, r.ProfileColor]));
  const groupColorMap = Object.fromEntries(groups.map((g) => [g.Profile, g.ProfileColor]));

  const mfaEnabledCount  = users.filter((u) => u.MfaEnabled).length;
  const mfaMissingCount  = users.filter((u) => u.ConsoleAccess && !u.MfaEnabled).length;

  const filteredUsers = users.filter((u) => {
    const matchProfile = userProfiles.length === 0 || userProfiles.includes(u.Profile);
    const matchSearch  = !userSearch || u.Username.toLowerCase().includes(userSearch.toLowerCase());
    return matchProfile && matchSearch;
  });

  const filteredRoles = roles.filter((r) => {
    const matchProfile = roleProfiles.length === 0 || roleProfiles.includes(r.Profile);
    const matchSearch  = !roleSearch || r.RoleName.toLowerCase().includes(roleSearch.toLowerCase());
    return matchProfile && matchSearch;
  });

  const filteredGroups = groups.filter((g) => {
    const matchProfile = groupProfiles.length === 0 || groupProfiles.includes(g.Profile);
    const matchSearch  = !groupSearch || g.GroupName.toLowerCase().includes(groupSearch.toLowerCase());
    return matchProfile && matchSearch;
  });

  const userHasFilter  = userSearch.trim() !== "" || (userProfiles.length > 0 && userProfiles.length < allUserProfiles.length);
  const roleHasFilter  = roleSearch.trim() !== "" || (roleProfiles.length > 0 && roleProfiles.length < allRoleProfiles.length);
  const groupHasFilter = groupSearch.trim() !== "" || (groupProfiles.length > 0 && groupProfiles.length < allGroupProfiles.length);

  const tabCls = (t: ActiveTab) =>
    t === activeTab
      ? "px-4 py-2 text-sm font-medium border-b-2 border-blue-500 text-slate-900 dark:text-white transition-colors"
      : "px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-b-2 border-transparent transition-colors";

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-full">
      {/* Drawers */}
      <UserDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />
      <RoleDrawer role={selectedRole} onClose={() => setSelectedRole(null)} />

      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">IAM</h2>
          {lastUpdated && (
            <p className="text-xs text-slate-400 mt-0.5">Synced {lastUpdated.toLocaleTimeString()}</p>
          )}
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Polling AWS…" : "Refresh"}
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Users"  value={loading ? 0 : users.length}  total={users.length}  color="blue"   icon={<Users size={20} />} />
        <StatCard label="Roles"  value={loading ? 0 : roles.length}  total={roles.length}  color="purple" icon={<Shield size={20} />} />
        <StatCard label="Groups" value={loading ? 0 : groups.length} total={groups.length} color="green"  icon={<UserCheck size={20} />} />
        <StatCard
          label="MFA Missing"
          value={loading ? 0 : mfaMissingCount}
          total={users.length}
          color="red"
          icon={<ShieldOff size={20} />}
          ratio={users.length > 0 ? `${mfaEnabledCount} of ${users.length} users have MFA` : undefined}
        />
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/20 p-6 text-red-600 dark:text-red-400 mb-4">
          <p className="font-semibold mb-1">Failed to load IAM data</p>
          <p className="text-sm font-mono opacity-80 mb-3">{error}</p>
          <button onClick={() => load()} className="text-sm underline hover:no-underline">Try again</button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="border-b border-slate-200 dark:border-[#2a2d3a] mb-4">
        <nav className="flex items-center gap-1 -mb-px">
          <button onClick={() => setActiveTab("users")}  className={tabCls("users")}>
            Users {!loading && <span className="ml-1 text-xs text-slate-400">({users.length})</span>}
          </button>
          <button onClick={() => setActiveTab("roles")}  className={tabCls("roles")}>
            Roles {!loading && <span className="ml-1 text-xs text-slate-400">({roles.length})</span>}
          </button>
          <button onClick={() => setActiveTab("groups")} className={tabCls("groups")}>
            Groups {!loading && <span className="ml-1 text-xs text-slate-400">({groups.length})</span>}
          </button>
        </nav>
      </div>

      {/* ── Tab content ── */}
      {activeTab === "users" && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" placeholder="Search users…" value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-200 dark:placeholder-slate-500" />
            </div>
            <DropdownChip label="Profile" allItems={allUserProfiles} selectedItems={userProfiles}
              onChange={(v) => { setUserProfiles(v); setUserPage(1); }}
              renderItem={(name) => (
                <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 truncate">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: userColorMap[name] ?? "#6366f1" }} />
                  {name}
                </span>
              )} />
            {userHasFilter && (
              <button onClick={() => { setUserSearch(""); setUserProfiles([...new Set(users.map((u) => u.Profile))]); setUserPage(1); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                <X size={12} />Clear filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{filteredUsers.length} of {users.length} users</span>
              {users.length > 0 && <Pagination total={filteredUsers.length} page={userPage} pageSize={userPageSize} onPageChange={setUserPage} onPageSizeChange={(s) => { setUserPageSize(s); setUserPage(1); }} />}
            </div>
          </div>
          <UsersTable users={filteredUsers} loading={loading} onClearFilters={() => { setUserSearch(""); setUserProfiles([...new Set(users.map((u) => u.Profile))]); setUserPage(1); }} hasActiveFilters={userHasFilter} page={userPage} pageSize={userPageSize} onRowClick={setSelectedUser} />
        </>
      )}

      {activeTab === "roles" && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" placeholder="Search roles…" value={roleSearch}
                onChange={(e) => { setRoleSearch(e.target.value); setRolePage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-200 dark:placeholder-slate-500" />
            </div>
            <DropdownChip label="Profile" allItems={allRoleProfiles} selectedItems={roleProfiles}
              onChange={(v) => { setRoleProfiles(v); setRolePage(1); }}
              renderItem={(name) => (
                <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 truncate">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: roleColorMap[name] ?? "#6366f1" }} />
                  {name}
                </span>
              )} />
            {roleHasFilter && (
              <button onClick={() => { setRoleSearch(""); setRoleProfiles([...new Set(roles.map((r) => r.Profile))]); setRolePage(1); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                <X size={12} />Clear filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{filteredRoles.length} of {roles.length} roles</span>
              {roles.length > 0 && <Pagination total={filteredRoles.length} page={rolePage} pageSize={rolePageSize} onPageChange={setRolePage} onPageSizeChange={(s) => { setRolePageSize(s); setRolePage(1); }} />}
            </div>
          </div>
          <RolesTable roles={filteredRoles} loading={loading} onClearFilters={() => { setRoleSearch(""); setRoleProfiles([...new Set(roles.map((r) => r.Profile))]); setRolePage(1); }} hasActiveFilters={roleHasFilter} page={rolePage} pageSize={rolePageSize} onRowClick={setSelectedRole} />
        </>
      )}

      {activeTab === "groups" && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" placeholder="Search groups…" value={groupSearch}
                onChange={(e) => { setGroupSearch(e.target.value); setGroupPage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-200 dark:placeholder-slate-500" />
            </div>
            <DropdownChip label="Profile" allItems={allGroupProfiles} selectedItems={groupProfiles}
              onChange={(v) => { setGroupProfiles(v); setGroupPage(1); }}
              renderItem={(name) => (
                <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 truncate">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: groupColorMap[name] ?? "#6366f1" }} />
                  {name}
                </span>
              )} />
            {groupHasFilter && (
              <button onClick={() => { setGroupSearch(""); setGroupProfiles([...new Set(groups.map((g) => g.Profile))]); setGroupPage(1); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                <X size={12} />Clear filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{filteredGroups.length} of {groups.length} groups</span>
              {groups.length > 0 && <Pagination total={filteredGroups.length} page={groupPage} pageSize={groupPageSize} onPageChange={setGroupPage} onPageSizeChange={(s) => { setGroupPageSize(s); setGroupPage(1); }} />}
            </div>
          </div>
          <GroupsTable groups={filteredGroups} loading={loading} onClearFilters={() => { setGroupSearch(""); setGroupProfiles([...new Set(groups.map((g) => g.Profile))]); setGroupPage(1); }} hasActiveFilters={groupHasFilter} page={groupPage} pageSize={groupPageSize} />
        </>
      )}
    </div>
  );
}
