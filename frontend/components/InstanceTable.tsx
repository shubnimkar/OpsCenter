"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Copy, Check, Terminal } from "lucide-react";
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

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-1.5 transition-opacity text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "Name",          label: "Name" },
  { key: "State",         label: "State" },
  { key: "Instance ID",   label: "Instance ID" },
  { key: "Instance Type", label: "Type" },
  { key: "Public IP",     label: "Public IP" },
  { key: "Private IP",    label: "Private IP" },
];
// Actions column rendered separately (not sortable)

export default function InstanceTable({ instances, loading, onClearFilters, hasActiveFilters, page, pageSize }: InstanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("Name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [copiedSshId, setCopiedSshId] = useState<string | null>(null);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...instances].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc"
      ? <ChevronUp size={13} className="text-blue-500" />
      : <ChevronDown size={13} className="text-blue-500" />;
  };

  // Empty states (only shown when not loading)
  if (!loading && sorted.length === 0) {
    if (hasActiveFilters) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <p className="text-lg font-medium text-slate-600 dark:text-slate-300">No instances match the current filters.</p>
          <button
            onClick={onClearFilters}
            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors"
          >
            Clear filters
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-lg font-medium">No instances found</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
              {/* Actions column — not sortable */}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />)
              : paginated.map((inst, i) => {
                  const sshCmd = `ssh ec2-user@${inst["Public IP"]}`;
                  const hasIp = Boolean(inst["Public IP"] && inst["Public IP"] !== "-" && inst["Public IP"] !== "");

                  return (
                    <tr
                      key={inst["Instance ID"] + i}
                      className="group bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538]"
                    >
                      <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap dark:text-slate-200">
                        {inst.Name}
                      </td>
                      <td className="px-4 py-3">
                        <StateBadge state={inst.State} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap dark:text-slate-400">
                        <span className="inline-flex items-center">
                          {inst["Instance ID"]}
                          <CopyButton text={inst["Instance ID"]} />
                        </span>
                      </td>
                      <td
                        title={inst.AZ}
                        className="px-4 py-3 text-slate-600 whitespace-nowrap dark:text-slate-300"
                      >
                        {inst["Instance Type"]}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap dark:text-slate-400">
                        <span className="inline-flex items-center">
                          {inst["Public IP"] || "—"}
                          {inst["Public IP"] && inst["Public IP"] !== "-" && <CopyButton text={inst["Public IP"]} />}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap dark:text-slate-400">
                        {inst["Private IP"] || "—"}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {/* Copy SSH */}
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(sshCmd);
                              setCopiedSshId(inst["Instance ID"]);
                              setTimeout(() => setCopiedSshId(null), 1500);
                            }}
                            disabled={!hasIp}
                            title={hasIp ? `Copy: ${sshCmd}` : "No public IP"}
                            className={`p-1.5 rounded text-xs font-mono transition-colors ${
                              hasIp
                                ? copiedSshId === inst["Instance ID"]
                                  ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5"
                                : "text-slate-300 dark:text-slate-700 cursor-not-allowed"
                            }`}
                          >
                            {copiedSshId === inst["Instance ID"]
                              ? <Check size={14} />
                              : <Terminal size={14} />}
                          </button>
                        </div>
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
