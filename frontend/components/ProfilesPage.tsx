"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, Check, X, Sun, Moon, RefreshCw, AlertCircle } from "lucide-react";
import { fetchProfiles, createProfile, updateProfile, deleteProfile } from "@/lib/api";
import { Profile } from "@/lib/types";
import { useTheme } from "@/lib/theme";
import Link from "next/link";

const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-north-1",
  "sa-east-1", "ca-central-1", "me-south-1", "af-south-1",
];

const EMPTY_FORM = { name: "", access_key: "", secret_key: "", region: "us-east-1" };

type EditForm = { name: string; access_key: string; secret_key: string; region: string };

const inputCls =
  "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors dark:bg-[#0f1117] dark:border-[#2a2d3a] dark:text-slate-200 dark:placeholder-slate-600";

export default function ProfilesPage() {
  const { theme, toggle } = useTheme();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit state — one row at a time
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Track what was originally in the row so we can diff
  const [editOriginal, setEditOriginal] = useState<EditForm>(EMPTY_FORM);

  // Delete state
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProfiles();
      setProfiles(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Add ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.access_key.trim() || !form.secret_key.trim()) {
      setFormError("All fields are required.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createProfile(form);
      setProfiles(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(EMPTY_FORM);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to create profile");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────
  const startEdit = (profile: Profile) => {
    const initial = { name: profile.name, access_key: "", secret_key: "", region: profile.region };
    setEditingId(profile.id);
    setEditForm(initial);
    setEditOriginal(initial);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleSave = async (id: number) => {
    setEditError(null);

    // Build only the fields that changed (skip empty credential fields — means user didn't touch them)
    const patch: Partial<EditForm> = {};
    if (editForm.name !== editOriginal.name) patch.name = editForm.name;
    if (editForm.region !== editOriginal.region) patch.region = editForm.region;
    if (editForm.access_key.trim()) patch.access_key = editForm.access_key;
    if (editForm.secret_key.trim()) patch.secret_key = editForm.secret_key;

    if (Object.keys(patch).length === 0) {
      setEditError("No changes detected.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile(id, patch);
      setProfiles(prev =>
        prev.map(p => (p.id === id ? updated : p)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Remove profile "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteProfile(id);
      setProfiles(prev => prev.filter(p => p.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete profile");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ── */}
      <aside className="w-64 shrink-0 flex flex-col bg-white border-r border-slate-200 dark:bg-[#161825] dark:border-[#2a2d3a]">
        <div className="p-6 border-b border-slate-200 dark:border-[#2a2d3a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">☁️</span>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">AWS EC2</h1>
              <p className="text-xs text-slate-400 dark:text-slate-500">Dashboard</p>
            </div>
          </div>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-white/5 transition-colors"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5 transition-colors"
          >
            Instances
          </Link>
          <Link
            href="/profiles"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-600/20 dark:text-blue-300 dark:border-blue-500/30 font-medium"
          >
            Profiles
          </Link>
        </nav>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 p-8 overflow-auto bg-slate-100 dark:bg-[#0f1117]">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* Header */}
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">AWS Profiles</h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
              Manage the AWS accounts this dashboard connects to
            </p>
          </div>

          {/* ── Add form ── */}
          <div className="bg-white dark:bg-[#161825] rounded-xl border border-slate-200 dark:border-[#2a2d3a] p-6">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
              <Plus size={15} /> Add new profile
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Profile name</label>
                <input type="text" placeholder="e.g. Production" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">AWS Access Key ID</label>
                <input type="text" placeholder="AKIAIOSFODNN7EXAMPLE" value={form.access_key}
                  onChange={e => setForm(f => ({ ...f, access_key: e.target.value }))}
                  className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">AWS Secret Access Key</label>
                <input type="password" placeholder="••••••••••••••••••••••••••••••••••••••••" value={form.secret_key}
                  onChange={e => setForm(f => ({ ...f, secret_key: e.target.value }))}
                  className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Region</label>
                <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                  className={inputCls}>
                  {AWS_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle size={14} /> {formError}
                </div>
              )}
              <button type="submit" disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
                {submitting
                  ? <><RefreshCw size={14} className="animate-spin" /> Saving…</>
                  : <><Plus size={14} /> Add Profile</>}
              </button>
            </form>
          </div>

          {/* ── Profiles list ── */}
          <div className="bg-white dark:bg-[#161825] rounded-xl border border-slate-200 dark:border-[#2a2d3a] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2a2d3a]">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Saved profiles ({profiles.length})
              </h3>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-400 dark:text-slate-500">
                <RefreshCw size={16} className="animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : error ? (
              <div className="p-6 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle size={14} /> {error}
              </div>
            ) : profiles.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
                No profiles yet. Add one above to get started.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
                {profiles.map(profile => (
                  <li key={profile.id}>
                    {editingId === profile.id ? (
                      /* ── Inline edit row ── */
                      <div className="px-6 py-4 space-y-3 bg-slate-50 dark:bg-[#1c1f2e]">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Profile name</label>
                            <input type="text" value={editForm.name}
                              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                              className={inputCls} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Region</label>
                            <select value={editForm.region}
                              onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))}
                              className={inputCls}>
                              {AWS_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            AWS Access Key ID
                            <span className="ml-1 font-normal text-slate-400 dark:text-slate-600">(leave blank to keep current)</span>
                          </label>
                          <input type="text" placeholder="AKIAIOSFODNN7EXAMPLE" value={editForm.access_key}
                            onChange={e => setEditForm(f => ({ ...f, access_key: e.target.value }))}
                            className={`${inputCls} font-mono`} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            AWS Secret Access Key
                            <span className="ml-1 font-normal text-slate-400 dark:text-slate-600">(leave blank to keep current)</span>
                          </label>
                          <input type="password" placeholder="Leave blank to keep current"
                            value={editForm.secret_key}
                            onChange={e => setEditForm(f => ({ ...f, secret_key: e.target.value }))}
                            className={`${inputCls} font-mono`} />
                        </div>
                        {editError && (
                          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                            <AlertCircle size={13} /> {editError}
                          </div>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <button onClick={() => handleSave(profile.id)} disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
                            {saving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                            Save
                          </button>
                          <button onClick={cancelEdit}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors">
                            <X size={12} /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal row ── */
                      <div className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-[#1c1f2e] transition-colors">
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{profile.name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{profile.region}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(profile)}
                            aria-label={`Edit profile ${profile.name}`}
                            className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/30 transition-colors">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => handleDelete(profile.id, profile.name)}
                            disabled={deletingId === profile.id}
                            aria-label={`Delete profile ${profile.name}`}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40">
                            {deletingId === profile.id
                              ? <RefreshCw size={15} className="animate-spin" />
                              : <Trash2 size={15} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
