"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Copy, Check } from "lucide-react";
import { Instance } from "@/lib/types";
import StateBadge from "./StateBadge";
import ProfileBadge from "./ProfileBadge";

type SortKey = keyof Instance;
type SortDir = "asc" | "desc";

interface InstanceTableProps {
  instances: Instance[];
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
      className="ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "Profile",       label: "Profile" },
  { key: "Name",          label: "Name" },
  { key: "State",         label: "State" },
  { key: "Instance ID",   label: "Instance ID" },
  { key: "Instance Type", label: "Type" },
  { key: "Public IP",     label: "Public IP" },
  { key: "Private IP",    label: "Private IP" },
  { key: "AZ",            label: "AZ" },
];

export default function InstanceTable({ instances }: InstanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("Name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc"
      ? <ChevronUp size={13} className="text-blue-500" />
      : <ChevronDown size={13} className="text-blue-500" />;
  };

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-lg font-medium">No instances found</p>
        <p className="text-sm">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a]">
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
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
          {sorted.map((inst, i) => (
            <tr
              key={inst["Instance ID"] + i}
              className="group bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538]"
            >
              <td className="px-4 py-3">
                <ProfileBadge profile={inst.Profile} />
              </td>
              <td className="px-4 py-3 font-medium text-slate-700 max-w-[180px] truncate dark:text-slate-200" title={inst.Name}>
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
              <td className="px-4 py-3 text-slate-600 whitespace-nowrap dark:text-slate-300">
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
              <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap dark:text-slate-500">
                {inst.AZ}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
