"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Copy, Check, Terminal, Server } from "lucide-react";
import { Instance } from "@/lib/types";
import StateBadge from "./StateBadge";
import SkeletonRow from "./SkeletonRow";
import { PageSize } from "./Pagination";

type SortKey = keyof Instance;
type SortDir = "asc" | "desc";

interface InstanceTableProps {
  instances: Instance[];
  loading?: boolean;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  page: number;
  pageSize: PageSize;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      title="Copy"
      className="ml-1.5 p-0.5 rounded opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 focus-visible:opacity-100"
      style={{ color: "var(--text-tertiary)" }}
    >
      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
    </button>
  );
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "Name",           label: "Name" },
  { key: "State",          label: "State" },
  { key: "Instance ID",    label: "Instance ID" },
  { key: "Instance Type",  label: "Type" },
  { key: "Public IP",      label: "Public IP" },
  { key: "Private IP",     label: "Private IP" },
];

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} style={{ color: "var(--text-tertiary)" }} />;
  return sortDir === "asc"
    ? <ChevronUp size={12} style={{ color: "var(--brand)" }} />
    : <ChevronDown size={12} style={{ color: "var(--brand)" }} />;
}

export default function InstanceTable({ instances, loading, onClearFilters, hasActiveFilters, page, pageSize }: InstanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("Name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [copiedSshId, setCopiedSshId] = useState<string | null>(null);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...instances].sort((a, b) => {
    const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  if (!loading && sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-subtle)" }}>
          <Server size={22} style={{ color: "var(--text-tertiary)" }} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            {hasActiveFilters ? "No instances match" : "No instances found"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {hasActiveFilters ? "Try adjusting or clearing your filters." : "No EC2 instances are cached yet."}
          </p>
        </div>
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors duration-150"
            style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left select-none cursor-pointer whitespace-nowrap"
                >
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150"
                    style={{ color: sortKey === col.key ? "var(--brand)" : "var(--text-tertiary)" }}
                  >
                    {col.label}
                    <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider select-none whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />)
              : paginated.map((inst, i) => {
                  const sshCmd = `ssh ec2-user@${inst["Public IP"]}`;
                  const hasIp = Boolean(inst["Public IP"] && inst["Public IP"] !== "-" && inst["Public IP"] !== "");
                  const isCopiedSsh = copiedSshId === inst["Instance ID"];

                  return (
                    <tr
                      key={inst["Instance ID"] + i}
                      className="group/row border-b table-row-hover"
                      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-card)")}
                    >
                      {/* Name + AZ */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="block text-[14px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
                          {inst.Name || "—"}
                        </span>
                        {inst.AZ && (
                          <span className="block text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{inst.AZ}</span>
                        )}
                      </td>
                      {/* State */}
                      <td className="px-4 py-3 whitespace-nowrap"><StateBadge state={inst.State} /></td>
                      {/* Instance ID */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>
                          {inst["Instance ID"]}
                          <CopyButton text={inst["Instance ID"]} />
                        </span>
                      </td>
                      {/* Type */}
                      <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        {inst["Instance Type"]}
                      </td>
                      {/* Public IP */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>
                          {inst["Public IP"] || "—"}
                          {inst["Public IP"] && inst["Public IP"] !== "-" && <CopyButton text={inst["Public IP"]} />}
                        </span>
                      </td>
                      {/* Private IP */}
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        {inst["Private IP"] || "—"}
                      </td>
                      {/* SSH Action */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => {
                            if (!hasIp) return;
                            navigator.clipboard.writeText(sshCmd);
                            setCopiedSshId(inst["Instance ID"]);
                            setTimeout(() => setCopiedSshId(null), 1500);
                          }}
                          disabled={!hasIp}
                          title={hasIp ? `Copy: ${sshCmd}` : "No public IP"}
                          className="p-1.5 rounded-md transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                          style={isCopiedSsh ? { color: "#10b981", background: "rgba(16,185,129,0.1)" } : { color: "var(--text-tertiary)" }}
                          onMouseEnter={(e) => { if (hasIp && !isCopiedSsh) { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-muted)"; } }}
                          onMouseLeave={(e) => { if (!isCopiedSsh) { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; (e.currentTarget as HTMLElement).style.background = "transparent"; } }}
                        >
                          {isCopiedSsh ? <Check size={14} /> : <Terminal size={14} />}
                        </button>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
