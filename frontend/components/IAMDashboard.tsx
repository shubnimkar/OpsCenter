"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  RefreshCw, Users, Shield, UserCheck, Key, ChevronDown, ChevronUp,
  ChevronsUpDown, Copy, Check, X, Search,
  ShieldCheck, ShieldOff, Lock, Unlock, FileText, Activity,
} from "lucide-react";
import { fetchIAMUsers, fetchIAMRoles, fetchIAMGroups, triggerSchedulerPoll } from "@/lib/api";
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
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
function ageColor(iso: string | null, warn = 90, danger = 180): string {
  const d = daysAgo(iso);
  if (d === null) return "var(--text-tertiary)";
  if (d >= danger) return "#ef4444";
  if (d >= warn) return "#f59e0b";
  return "#10b981";
}

// ── Shared UI atoms ────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1.5 p-0.5 rounded opacity-0 group-hover/row:opacity-100 transition-opacity duration-150"
      style={{ color: "var(--text-tertiary)" }}>
      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
    </button>
  );
}

function Pill({ label, bg, text }: { label: string; bg: string; text: string }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: bg, color: text }}>{label}</span>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 mt-5 first:mt-0" style={{ color: "var(--text-tertiary)" }}>{children}</p>;
}

function DrawerDl({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <dt className="text-[13px] shrink-0" style={{ color: "var(--text-tertiary)" }}>{label}</dt>
      <dd className="text-[13px] text-right break-all" style={{ color: "var(--text-primary)" }}>{value ?? "—"}</dd>
    </div>
  );
}

// ── DropdownChip (local, for IAM/SES/Route53 which don't use shared FilterToolbar) ──

interface DropdownChipProps {
  label: string; allItems: string[]; selectedItems: string[];
  onChange: (items: string[]) => void; renderItem?: (item: string) => React.ReactNode;
}
function DropdownChip({ label, allItems, selectedItems, onChange, renderItem }: DropdownChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const allSel = selectedItems.length === 0 || selectedItems.length === allItems.length;
  const active = selectedItems.length > 0 && selectedItems.length < allItems.length ? selectedItems.length : null;
  const toggle = (item: string) => onChange(selectedItems.includes(item) ? selectedItems.filter((x) => x !== item) : [...selectedItems, item]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150"
        style={{ background: active !== null ? "rgba(37,99,235,0.08)" : "var(--bg-card)", border: `1px solid ${active !== null ? "rgba(59,130,246,0.45)" : "var(--border)"}`, color: active !== null ? "var(--brand)" : "var(--text-secondary)" }}>
        {label}
        {active !== null && <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-white bg-blue-600">{active}</span>}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 min-w-[180px] rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.14)" }}>
          <div className="flex items-center gap-3 px-3 pt-2.5 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <button type="button" onClick={() => onChange([])} className="text-[11px] font-medium text-blue-500">Select all</button>
            <button type="button" onClick={() => onChange([])} className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Clear</button>
          </div>
          <ul className="py-1 max-h-56 overflow-y-auto">
            {allItems.map((item) => (
              <li key={item}>
                <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer select-none" style={{ background: "transparent" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                  <input type="checkbox" checked={allSel ? true : selectedItems.includes(item)} onChange={() => toggle(item)} className="accent-blue-500 w-3.5 h-3.5 shrink-0" />
                  {renderItem ? renderItem(item) : <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>{item}</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Access Keys Section ────────────────────────────────────────────────────

function AccessKeysSection({ keys }: { keys: AccessKeyDetail[] }) {
  if (!keys?.length) return (
    <div><SectionLabel><Key size={10} className="inline mr-1" />Access Keys</SectionLabel>
      <p className="text-[13px] italic" style={{ color: "var(--text-tertiary)" }}>No access keys</p></div>
  );
  return (
    <div>
      <SectionLabel><Key size={10} className="inline mr-1" />Access Keys ({keys.length})</SectionLabel>
      <div className="space-y-3">
        {keys.map((k) => (
          <div key={k.access_key_id} className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between px-3 py-2.5" style={{ background: k.status === "Active" ? "rgba(16,185,129,0.08)" : "var(--bg-subtle)" }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: k.status === "Active" ? "#10b981" : "var(--text-tertiary)" }} />
                <span className="font-mono text-[12px] truncate" style={{ color: "var(--text-primary)" }}>{k.access_key_id}</span>
                <button onClick={() => navigator.clipboard.writeText(k.access_key_id)} className="p-0.5 rounded shrink-0" style={{ color: "var(--text-tertiary)" }}><Copy size={10} /></button>
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: k.status === "Active" ? "rgba(16,185,129,0.15)" : "var(--bg-muted)", color: k.status === "Active" ? "#10b981" : "var(--text-tertiary)" }}>{k.status}</span>
            </div>
            <dl className="divide-y" style={{ borderColor: "var(--border)" }}>
              <div className="flex justify-between px-3 py-2 gap-4">
                <dt className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Key age</dt>
                <dd className="text-[12px] font-medium text-right" style={{ color: ageColor(k.created_at, 180, 365) }}>
                  {k.created_at ? `${ageLabel(k.created_at)} · ${formatDate(k.created_at)}` : "—"}
                </dd>
              </div>
              <div className="flex justify-between px-3 py-2 gap-4">
                <dt className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Last used</dt>
                <dd className="text-[12px] text-right" style={{ color: ageColor(k.last_used_date, 90, 180) }}>
                  {k.last_used_date ? `${ageLabel(k.last_used_date)} · ${formatDate(k.last_used_date)}` : <span style={{ color: "var(--text-tertiary)" }}>Never</span>}
                </dd>
              </div>
              {(k.last_used_service || k.last_used_region) && (
                <div className="flex justify-between px-3 py-2 gap-4">
                  <dt className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Last used via</dt>
                  <dd className="text-[12px] text-right" style={{ color: "var(--text-secondary)" }}>{[k.last_used_service, k.last_used_region].filter(Boolean).join(" · ")}</dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inline Policies Section ─────────────────────────────────────────────────

function InlinePoliciesSection({ policies }: { policies: InlinePolicy[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div>
      <SectionLabel><FileText size={10} className="inline mr-1" />Inline Policies ({policies.length})</SectionLabel>
      <div className="space-y-2">
        {policies.map((policy) => {
          const isOpen = expanded === policy.name;
          const json = JSON.stringify(policy.document, null, 2);
          return (
            <div key={policy.name} className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
              <button type="button" onClick={() => setExpanded(isOpen ? null : policy.name)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors duration-150"
                style={{ background: "rgba(245,158,11,0.08)" }}>
                <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "#f59e0b" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />{policy.name}
                </span>
                <span className="flex items-center gap-1.5" style={{ color: "var(--text-tertiary)" }}>
                  <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(json); }} className="p-0.5 rounded"><Copy size={11} /></button>
                  {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              </button>
              {isOpen && (
                <pre className="px-3 py-3 text-[12px] font-mono overflow-x-auto max-h-72 leading-relaxed whitespace-pre-wrap break-words"
                  style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                  {Object.keys(policy.document).length === 0 ? "Policy document unavailable" : json}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── User Drawer ─────────────────────────────────────────────────────────────

function UserDrawer({ user, onClose }: { user: IAMUser | null; onClose: () => void }) {
  return (
    <SlideOverDrawer isOpen={!!user} onClose={onClose} title={user ? `User: ${user.Username}` : ""}>
      {user && (
        <div>
          <SectionLabel>Identity</SectionLabel>
          <DrawerDl label="Username" value={<span className="font-semibold">{user.Username}</span>} />
          <DrawerDl label="User ID" value={<span className="font-mono text-[12px]">{user.UserId}</span>} />
          <DrawerDl label="Path" value={<span className="font-mono text-[12px]">{user.Path}</span>} />
          <DrawerDl label="Created" value={formatDate(user.CreatedAt)} />

          <SectionLabel>ARN</SectionLabel>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <span className="font-mono text-[11px] break-all flex-1" style={{ color: "var(--text-secondary)" }}>{user.Arn}</span>
            <button onClick={() => navigator.clipboard.writeText(user.Arn)} className="shrink-0 p-0.5 rounded" style={{ color: "var(--text-tertiary)" }}><Copy size={12} /></button>
          </div>

          <SectionLabel><Activity size={10} className="inline mr-1" />Activity</SectionLabel>
          <DrawerDl label="Last activity" value={user.LastActivity ? <span style={{ color: ageColor(user.LastActivity, 90, 180), fontWeight: 600 }}>{ageLabel(user.LastActivity)} · {formatDate(user.LastActivity)}</span> : <span style={{ color: "var(--text-tertiary)" }}>Never</span>} />
          <DrawerDl label="Last console sign-in" value={user.PasswordLastUsed ? `${ageLabel(user.PasswordLastUsed)} · ${formatDate(user.PasswordLastUsed)}` : <span style={{ color: "var(--text-tertiary)" }}>Never</span>} />

          <SectionLabel>Console Access</SectionLabel>
          <DrawerDl label="Console access" value={user.ConsoleAccess ? <Pill label="Enabled" bg="rgba(16,185,129,0.1)" text="#10b981" /> : <Pill label="Disabled" bg="var(--bg-subtle)" text="var(--text-tertiary)" />} />
          <DrawerDl label="MFA" value={user.MfaEnabled ? <Pill label="Enabled" bg="rgba(16,185,129,0.1)" text="#10b981" /> : <Pill label="Not enabled" bg="rgba(239,68,68,0.1)" text="#ef4444" />} />
          {user.ConsoleAccess && <DrawerDl label="Password age" value={<span style={{ color: ageColor(user.PasswordCreatedAt, 90, 180), fontWeight: 600 }}>{ageLabel(user.PasswordCreatedAt)}</span>} />}

          <AccessKeysSection keys={user.AccessKeysDetail ?? []} />

          {user.Groups.length > 0 && (
            <div>
              <SectionLabel>Groups ({user.Groups.length})</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {user.Groups.map((g) => (
                  <span key={g} className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>{g}</span>
                ))}
              </div>
            </div>
          )}

          {user.AttachedPolicies.length > 0 && (
            <div>
              <SectionLabel>Attached Policies ({user.AttachedPolicies.length})</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {user.AttachedPolicies.map((p) => (
                  <span key={p} className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "rgba(37,99,235,0.1)", color: "var(--brand)" }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {user.InlinePolicies?.length > 0 && <InlinePoliciesSection policies={user.InlinePolicies} />}
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Role Drawer ─────────────────────────────────────────────────────────────

function RoleDrawer({ role, onClose }: { role: IAMRole | null; onClose: () => void }) {
  return (
    <SlideOverDrawer isOpen={!!role} onClose={onClose} title={role ? `Role: ${role.RoleName}` : ""}>
      {role && (
        <div>
          <SectionLabel>Identity</SectionLabel>
          <DrawerDl label="Role name" value={<span className="font-semibold">{role.RoleName}</span>} />
          <DrawerDl label="Role ID" value={<span className="font-mono text-[12px]">{role.RoleId}</span>} />
          <DrawerDl label="Path" value={<span className="font-mono text-[12px]">{role.Path}</span>} />
          <DrawerDl label="Max session" value={`${Math.round(role.MaxSessionDuration / 3600)}h`} />
          <DrawerDl label="Created" value={formatDate(role.CreatedAt)} />
          {role.Description && <DrawerDl label="Description" value={role.Description} />}

          <SectionLabel>ARN</SectionLabel>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <span className="font-mono text-[11px] break-all flex-1" style={{ color: "var(--text-secondary)" }}>{role.Arn}</span>
            <button onClick={() => navigator.clipboard.writeText(role.Arn)} className="shrink-0 p-0.5 rounded" style={{ color: "var(--text-tertiary)" }}><Copy size={12} /></button>
          </div>

          {role.TrustedServices.length > 0 && (
            <div>
              <SectionLabel>Trusted Services ({role.TrustedServices.length})</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {role.TrustedServices.map((s) => (
                  <span key={s} className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>{s.replace(".amazonaws.com", "")}</span>
                ))}
              </div>
            </div>
          )}

          {role.AttachedPolicies.length > 0 && (
            <div>
              <SectionLabel>Attached Policies ({role.AttachedPolicies.length})</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {role.AttachedPolicies.map((p) => (
                  <span key={p} className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "rgba(37,99,235,0.1)", color: "var(--brand)" }}>{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div className="overflow-x-auto"><table className="w-full">{children}</table></div>
    </div>
  );
}
function Th({ children, sortKey, col, onClick }: { children: React.ReactNode; sortKey: string; col: string; onClick: () => void }) {
  return (
    <th onClick={onClick} className="px-4 py-3 text-left select-none cursor-pointer whitespace-nowrap">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: sortKey === col ? "var(--brand)" : "var(--text-tertiary)" }}>
        {children}
      </span>
    </th>
  );
}

// Users Table
type UserSortKey = "Username" | "Profile" | "CreatedAt" | "PasswordLastUsed" | "AccessKeyCount" | "LastActivity";
const USER_COLS: { key: UserSortKey; label: string }[] = [
  { key: "Username", label: "Username" }, { key: "Profile", label: "Profile" },
  { key: "LastActivity", label: "Last Activity" }, { key: "PasswordLastUsed", label: "Last Sign-in" },
  { key: "AccessKeyCount", label: "Keys" },
];

function UsersTable({ users, loading, onClearFilters, hasActiveFilters, page, pageSize, onRowClick }: {
  users: IAMUser[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize; onRowClick: (u: IAMUser) => void;
}) {
  const [sortKey, setSortKey] = useState<UserSortKey>("Username");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const handleSort = (k: UserSortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...users].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    if (sortKey === "AccessKeyCount") { const cmp = Number(av) - Number(bv); return sortDir === "asc" ? cmp : -cmp; }
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const SI = ({ col }: { col: UserSortKey }) => col !== sortKey ? <ChevronsUpDown size={12} style={{ color: "var(--text-tertiary)" }} /> : sortDir === "asc" ? <ChevronUp size={12} style={{ color: "var(--brand)" }} /> : <ChevronDown size={12} style={{ color: "var(--brand)" }} />;

  if (!loading && sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 rounded-xl border gap-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>{hasActiveFilters ? "No users match the current filters." : "No IAM users found"}</p>
      {hasActiveFilters && <button onClick={onClearFilters} className="px-4 py-1.5 rounded-lg text-[13px]" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Clear filters</button>}
    </div>
  );

  return (
    <TableShell>
      <thead>
        <tr className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
          {USER_COLS.map((col) => <Th key={col.key} sortKey={sortKey} col={col.key} onClick={() => handleSort(col.key)}>{col.label} <SI col={col.key} /></Th>)}
          <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>Security</th>
          <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>Permissions</th>
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />) : paginated.map((user) => {
          const managed = user.AttachedPolicies.length; const inline = user.InlinePolicies?.length ?? 0;
          return (
            <tr key={`${user.Profile}:${user.Username}`} onClick={() => onRowClick(user)}
              className="group/row border-b table-row-hover cursor-pointer"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-card)")}>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="inline-flex items-center text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {user.Username}<CopyButton text={user.Username} />
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={user.Profile} color={user.ProfileColor} envTag={user.ProfileEnvTag} /></td>
              <td className="px-4 py-3 whitespace-nowrap">
                {user.LastActivity ? <span className="text-[12px] font-medium" style={{ color: ageColor(user.LastActivity, 90, 180) }}>{ageLabel(user.LastActivity)}</span> : <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Never</span>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {user.PasswordLastUsed ? <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ageLabel(user.PasswordLastUsed)}</span> : <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>—</span>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {user.AccessKeyCount > 0 ? <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: "var(--text-secondary)" }}><Key size={12} />{user.ActiveKeyCount}/{user.AccessKeyCount}</span> : <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>—</span>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  {user.MfaEnabled
                    ? <span title="MFA enabled"><ShieldCheck size={15} className="text-emerald-500" /></span>
                    : <span title="MFA not enabled"><ShieldOff size={15} className="text-red-400" /></span>}
                  {user.ConsoleAccess
                    ? <span title="Console access"><Unlock size={14} style={{ color: "var(--text-tertiary)" }} /></span>
                    : <span title="No console access"><Lock size={14} style={{ color: "var(--text-tertiary)", opacity: 0.4 }} /></span>}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {managed > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ background: "rgba(37,99,235,0.1)", color: "var(--brand)" }}>{managed} managed</span>}
                  {inline > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>{inline} inline</span>}
                  {managed === 0 && inline === 0 && <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>None</span>}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}

// Roles Table
type RoleSortKey = "RoleName" | "Profile" | "CreatedAt" | "MaxSessionDuration";
const ROLE_COLS: { key: RoleSortKey; label: string }[] = [
  { key: "RoleName", label: "Role Name" }, { key: "Profile", label: "Profile" },
  { key: "CreatedAt", label: "Created" }, { key: "MaxSessionDuration", label: "Max Session" },
];

function RolesTable({ roles, loading, onClearFilters, hasActiveFilters, page, pageSize, onRowClick }: {
  roles: IAMRole[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize; onRowClick: (r: IAMRole) => void;
}) {
  const [sortKey, setSortKey] = useState<RoleSortKey>("RoleName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const handleSort = (k: RoleSortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...roles].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    if (sortKey === "MaxSessionDuration") { return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av); }
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const SI = ({ col }: { col: RoleSortKey }) => col !== sortKey ? <ChevronsUpDown size={12} style={{ color: "var(--text-tertiary)" }} /> : sortDir === "asc" ? <ChevronUp size={12} style={{ color: "var(--brand)" }} /> : <ChevronDown size={12} style={{ color: "var(--brand)" }} />;

  if (!loading && sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 rounded-xl border gap-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>{hasActiveFilters ? "No roles match." : "No IAM roles found"}</p>
      {hasActiveFilters && <button onClick={onClearFilters} className="px-4 py-1.5 rounded-lg text-[13px]" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Clear filters</button>}
    </div>
  );

  return (
    <TableShell>
      <thead>
        <tr className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
          {ROLE_COLS.map((col) => <Th key={col.key} sortKey={sortKey} col={col.key} onClick={() => handleSort(col.key)}>{col.label} <SI col={col.key} /></Th>)}
          <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>Trusted Services</th>
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={5} />) : paginated.map((role) => (
          <tr key={`${role.Profile}:${role.RoleName}`} onClick={() => onRowClick(role)}
            className="group/row border-b table-row-hover cursor-pointer"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-card)")}>
            <td className="px-4 py-3 max-w-[260px]">
              <div className="flex items-center gap-1 min-w-0">
                <span className="truncate text-[14px] font-semibold" title={role.RoleName} style={{ color: "var(--text-primary)" }}>{role.RoleName}</span>
                <CopyButton text={role.RoleName} />
              </div>
              {role.Description && <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>{role.Description}</p>}
            </td>
            <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={role.Profile} color={role.ProfileColor} envTag={role.ProfileEnvTag} /></td>
            <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>{formatDate(role.CreatedAt)}</td>
            <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>{Math.round(role.MaxSessionDuration / 3600)}h</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                {role.TrustedServices.slice(0, 2).map((s) => <span key={s} className="px-1.5 py-0.5 rounded text-[11px] font-medium truncate max-w-[120px]" title={s} style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>{s.replace(".amazonaws.com", "")}</span>)}
                {role.TrustedServices.length > 2 && <span className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}>+{role.TrustedServices.length - 2}</span>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

// Groups Table
type GroupSortKey = "GroupName" | "Profile" | "MemberCount" | "CreatedAt";
const GROUP_COLS: { key: GroupSortKey; label: string }[] = [
  { key: "GroupName", label: "Group Name" }, { key: "Profile", label: "Profile" },
  { key: "MemberCount", label: "Members" }, { key: "CreatedAt", label: "Created" },
];

function GroupsTable({ groups, loading, onClearFilters, hasActiveFilters, page, pageSize }: {
  groups: IAMGroup[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize;
}) {
  const [sortKey, setSortKey] = useState<GroupSortKey>("GroupName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const handleSort = (k: GroupSortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...groups].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    if (sortKey === "MemberCount") { return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av); }
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const SI = ({ col }: { col: GroupSortKey }) => col !== sortKey ? <ChevronsUpDown size={12} style={{ color: "var(--text-tertiary)" }} /> : sortDir === "asc" ? <ChevronUp size={12} style={{ color: "var(--brand)" }} /> : <ChevronDown size={12} style={{ color: "var(--brand)" }} />;

  if (!loading && sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 rounded-xl border gap-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>{hasActiveFilters ? "No groups match." : "No IAM groups found"}</p>
      {hasActiveFilters && <button onClick={onClearFilters} className="px-4 py-1.5 rounded-lg text-[13px]" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Clear filters</button>}
    </div>
  );

  return (
    <TableShell>
      <thead>
        <tr className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
          {GROUP_COLS.map((col) => <Th key={col.key} sortKey={sortKey} col={col.key} onClick={() => handleSort(col.key)}>{col.label} <SI col={col.key} /></Th>)}
          <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>Policies</th>
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={5} />) : paginated.map((group) => (
          <tr key={`${group.Profile}:${group.GroupName}`}
            className="group/row border-b table-row-hover"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-card)")}>
            <td className="px-4 py-3 whitespace-nowrap">
              <span className="inline-flex items-center text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {group.GroupName}<CopyButton text={group.GroupName} />
              </span>
            </td>
            <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={group.Profile} color={group.ProfileColor} envTag={group.ProfileEnvTag} /></td>
            <td className="px-4 py-3 whitespace-nowrap text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{group.MemberCount}</td>
            <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>{formatDate(group.CreatedAt)}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                {group.AttachedPolicies.slice(0, 3).map((p) => <span key={p} className="px-1.5 py-0.5 rounded text-[11px] truncate max-w-[140px]" title={p} style={{ background: "rgba(37,99,235,0.1)", color: "var(--brand)" }}>{p}</span>)}
                {group.AttachedPolicies.length > 3 && <span className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}>+{group.AttachedPolicies.length - 3}</span>}
                {group.AttachedPolicies.length === 0 && <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>—</span>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

type ActiveTab = "users" | "roles" | "groups";

export default function IAMDashboard() {
  const [users,  setUsers]  = useState<IAMUser[]>([]);
  const [roles,  setRoles]  = useState<IAMRole[]>([]);
  const [groups, setGroups] = useState<IAMGroup[]>([]);

  const beforeRefresh = useCallback(async () => { await triggerSchedulerPoll(); await new Promise((r) => setTimeout(r, 2000)); }, []);
  const fetchAll = useCallback(() => Promise.all([fetchIAMUsers(), fetchIAMRoles(), fetchIAMGroups()]), []);
  const onData = useCallback(([u, r, g]: [IAMUser[], IAMRole[], IAMGroup[]]) => { setUsers(u); setRoles(r); setGroups(g); }, []);
  const { loading, error, lastUpdated, refreshing, load } = useResourceLoad({ fetcher: fetchAll, onData, beforeRefresh });

  const [activeTab, setActiveTab] = useState<ActiveTab>("users");
  const [selectedUser, setSelectedUser] = useState<IAMUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<IAMRole | null>(null);

  const [userSearch, setUserSearch] = useState(""); const [userProfiles, setUserProfiles] = useState<string[]>([]);
  const [userPage, setUserPage] = useState(1); const [userPageSize, setUserPageSize] = useState<PageSize>(10);
  const [roleSearch, setRoleSearch] = useState(""); const [roleProfiles, setRoleProfiles] = useState<string[]>([]);
  const [rolePage, setRolePage] = useState(1); const [rolePageSize, setRolePageSize] = useState<PageSize>(10);
  const [groupSearch, setGroupSearch] = useState(""); const [groupProfiles, setGroupProfiles] = useState<string[]>([]);
  const [groupPage, setGroupPage] = useState(1); const [groupPageSize, setGroupPageSize] = useState<PageSize>(10);

  const allUserProfiles  = [...new Set(users.map((u) => u.Profile))].sort();
  const allRoleProfiles  = [...new Set(roles.map((r) => r.Profile))].sort();
  const allGroupProfiles = [...new Set(groups.map((g) => g.Profile))].sort();
  const profileColorMap  = Object.fromEntries([...users, ...roles, ...groups].map((x) => [x.Profile, x.ProfileColor]));

  const mfaMissingCount = users.filter((u) => u.ConsoleAccess && !u.MfaEnabled).length;
  const mfaEnabledCount = users.filter((u) => u.MfaEnabled).length;

  const filteredUsers  = users.filter((u) => (!userSearch || u.Username.toLowerCase().includes(userSearch.toLowerCase())) && (userProfiles.length === 0 || userProfiles.includes(u.Profile)));
  const filteredRoles  = roles.filter((r) => (!roleSearch || r.RoleName.toLowerCase().includes(roleSearch.toLowerCase())) && (roleProfiles.length === 0 || roleProfiles.includes(r.Profile)));
  const filteredGroups = groups.filter((g) => (!groupSearch || g.GroupName.toLowerCase().includes(groupSearch.toLowerCase())) && (groupProfiles.length === 0 || groupProfiles.includes(g.Profile)));

  const userHasFilter  = userSearch.trim() !== "" || (userProfiles.length > 0 && userProfiles.length < allUserProfiles.length);
  const roleHasFilter  = roleSearch.trim() !== "" || (roleProfiles.length > 0 && roleProfiles.length < allRoleProfiles.length);
  const groupHasFilter = groupSearch.trim() !== "" || (groupProfiles.length > 0 && groupProfiles.length < allGroupProfiles.length);

  const tabCls = (t: ActiveTab) => `px-4 py-2.5 text-[13px] font-medium transition-colors duration-150 border-b-2 ${activeTab === t ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent"} `;

  const ProfileChip = ({ allP, selectedP, onChange }: { allP: string[]; selectedP: string[]; onChange: (v: string[]) => void }) => (
    <DropdownChip label="Profile" allItems={allP} selectedItems={selectedP} onChange={onChange}
      renderItem={(name) => (
        <span className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-primary)" }}>
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: profileColorMap[name] ?? "#6366f1" }} />{name}
        </span>
      )} />
  );

  return (
    <div className="p-6 min-h-full" style={{ background: "var(--bg-page)" }}>
      <UserDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />
      <RoleDrawer role={selectedRole} onClose={() => setSelectedRole(null)} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>IAM</h1>
          {lastUpdated && <p className="text-[13px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>Synced {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 disabled:opacity-50" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Polling AWS…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Users"       value={loading ? 0 : users.length}  color="blue"   icon={<Users size={18} />} />
        <StatCard label="Roles"       value={loading ? 0 : roles.length}  color="purple" icon={<Shield size={18} />} />
        <StatCard label="Groups"      value={loading ? 0 : groups.length} color="green"  icon={<UserCheck size={18} />} />
        <StatCard label="MFA Missing" value={loading ? 0 : mfaMissingCount} color="red" icon={<ShieldOff size={18} />}
          ratio={users.length > 0 ? `${mfaEnabledCount} of ${users.length} have MFA` : undefined} />
      </div>

      {error && (
        <div className="rounded-xl border p-5 mb-4" style={{ background: "rgba(239,68,68,0.05)", borderColor: "rgba(239,68,68,0.2)" }}>
          <p className="text-[14px] font-semibold mb-1" style={{ color: "#ef4444" }}>Failed to load IAM data</p>
          <p className="text-[12px] font-mono opacity-80 mb-2" style={{ color: "#ef4444" }}>{error}</p>
          <button onClick={() => load()} className="text-[13px] underline" style={{ color: "var(--text-secondary)" }}>Try again</button>
        </div>
      )}

      <div className="mb-4 border-b" style={{ borderColor: "var(--border)" }}>
        <nav className="flex items-center -mb-px">
          {(["users", "roles", "groups"] as ActiveTab[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={tabCls(tab)} style={{ color: activeTab === tab ? "var(--brand)" : "var(--text-secondary)" }}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {!loading && <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-tertiary)" }}>({tab === "users" ? users.length : tab === "roles" ? roles.length : groups.length})</span>}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "users" && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-tertiary)" }} />
              <input type="text" placeholder="Search users…" value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg text-[13px] focus:outline-none transition-colors"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 200 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
            </div>
            <ProfileChip allP={allUserProfiles} selectedP={userProfiles} onChange={(v) => { setUserProfiles(v); setUserPage(1); }} />
            {userHasFilter && <button onClick={() => { setUserSearch(""); setUserProfiles([]); setUserPage(1); }} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-tertiary)" }}><X size={12} />Clear</button>}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{filteredUsers.length} of {users.length} users</span>
              {users.length > 0 && <Pagination total={filteredUsers.length} page={userPage} pageSize={userPageSize} onPageChange={setUserPage} onPageSizeChange={(s) => { setUserPageSize(s); setUserPage(1); }} />}
            </div>
          </div>
          <UsersTable users={filteredUsers} loading={loading} onClearFilters={() => { setUserSearch(""); setUserProfiles([]); setUserPage(1); }} hasActiveFilters={userHasFilter} page={userPage} pageSize={userPageSize} onRowClick={setSelectedUser} />
        </>
      )}

      {activeTab === "roles" && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-tertiary)" }} />
              <input type="text" placeholder="Search roles…" value={roleSearch} onChange={(e) => { setRoleSearch(e.target.value); setRolePage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg text-[13px] focus:outline-none"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 200 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
            </div>
            <ProfileChip allP={allRoleProfiles} selectedP={roleProfiles} onChange={(v) => { setRoleProfiles(v); setRolePage(1); }} />
            {roleHasFilter && <button onClick={() => { setRoleSearch(""); setRoleProfiles([]); setRolePage(1); }} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-tertiary)" }}><X size={12} />Clear</button>}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{filteredRoles.length} of {roles.length} roles</span>
              {roles.length > 0 && <Pagination total={filteredRoles.length} page={rolePage} pageSize={rolePageSize} onPageChange={setRolePage} onPageSizeChange={(s) => { setRolePageSize(s); setRolePage(1); }} />}
            </div>
          </div>
          <RolesTable roles={filteredRoles} loading={loading} onClearFilters={() => { setRoleSearch(""); setRoleProfiles([]); setRolePage(1); }} hasActiveFilters={roleHasFilter} page={rolePage} pageSize={rolePageSize} onRowClick={setSelectedRole} />
        </>
      )}

      {activeTab === "groups" && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-tertiary)" }} />
              <input type="text" placeholder="Search groups…" value={groupSearch} onChange={(e) => { setGroupSearch(e.target.value); setGroupPage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg text-[13px] focus:outline-none"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 200 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
            </div>
            <ProfileChip allP={allGroupProfiles} selectedP={groupProfiles} onChange={(v) => { setGroupProfiles(v); setGroupPage(1); }} />
            {groupHasFilter && <button onClick={() => { setGroupSearch(""); setGroupProfiles([]); setGroupPage(1); }} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-tertiary)" }}><X size={12} />Clear</button>}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{filteredGroups.length} of {groups.length} groups</span>
              {groups.length > 0 && <Pagination total={filteredGroups.length} page={groupPage} pageSize={groupPageSize} onPageChange={setGroupPage} onPageSizeChange={(s) => { setGroupPageSize(s); setGroupPage(1); }} />}
            </div>
          </div>
          <GroupsTable groups={filteredGroups} loading={loading} onClearFilters={() => { setGroupSearch(""); setGroupProfiles([]); setGroupPage(1); }} hasActiveFilters={groupHasFilter} page={groupPage} pageSize={groupPageSize} />
        </>
      )}
    </div>
  );
}
