import { Instance, Profile, ProfileCreate, ProfileSummary, S3Bucket, LambdaFunction, IAMUser, IAMRole, IAMGroup, SESIdentity, SESSendingQuota, SESAccountStats } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchInstances(): Promise<Instance[]> {
  const res = await fetch(`${API_BASE}/api/instances`, {
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch instances: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function fetchS3Buckets(): Promise<S3Bucket[]> {
  const res = await fetch(`${API_BASE}/api/s3-buckets`, {
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch S3 buckets: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function fetchLambdas(): Promise<LambdaFunction[]> {
  const res = await fetch(`${API_BASE}/api/lambdas`, {
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Lambda functions: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function fetchProfiles(): Promise<Profile[]> {
  const res = await fetch(`${API_BASE}/api/profiles`);

  if (!res.ok) {
    throw new Error(`Failed to fetch profiles: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function createProfile(data: ProfileCreate): Promise<Profile> {
  const res = await fetch(`${API_BASE}/api/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to create profile: ${res.status}`);
  }

  return res.json();
}

export async function updateProfile(id: number, data: Partial<ProfileCreate>): Promise<Profile> {
  const res = await fetch(`${API_BASE}/api/profiles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to update profile: ${res.status}`);
  }

  return res.json();
}

export async function deleteProfile(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/profiles/${id}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to delete profile: ${res.status}`);
  }
}

export interface ConnectionTestResult {
  ok: boolean;
  account_id?: string;
  arn?: string;
  message: string;
}

export async function testConnection(data: {
  access_key: string;
  secret_key: string;
  region: string;
}): Promise<ConnectionTestResult> {
  const res = await fetch(`${API_BASE}/api/profiles/test-connection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

export async function testSavedProfile(id: number): Promise<ConnectionTestResult> {
  const res = await fetch(`${API_BASE}/api/profiles/${id}/test-connection`, {
    method: "POST",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchProfileSummary(id: number): Promise<ProfileSummary> {
  const res = await fetch(`${API_BASE}/api/profiles/${id}/summary`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Failed to fetch profile summary: ${res.status}`);
  return res.json();
}

export async function reorderProfiles(orderedIds: number[]): Promise<void> {
  const res = await fetch(`${API_BASE}/api/profiles/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to reorder profiles: ${res.status}`);
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export interface SchedulerStatus {
  running: boolean;
  poll_interval_seconds: number;
  min_interval_seconds: number;
  max_interval_seconds: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: "ok" | "partial" | "error" | "never" | "unknown";
  last_error: string | null;
}

export async function fetchSchedulerStatus(): Promise<SchedulerStatus> {
  const res = await fetch(`${API_BASE}/api/scheduler/status`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Failed to fetch scheduler status: ${res.status}`);
  return res.json();
}

export async function triggerSchedulerPoll(): Promise<{ triggered: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/scheduler/trigger`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Trigger failed: ${res.status}`);
  }
  return res.json();
}

export async function updateSchedulerInterval(seconds: number): Promise<SchedulerStatus> {
  const res = await fetch(`${API_BASE}/api/scheduler/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poll_interval_seconds: seconds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Config update failed: ${res.status}`);
  }
  return res.json();
}

// ── IAM ───────────────────────────────────────────────────────────────────────

export async function fetchIAMUsers(): Promise<IAMUser[]> {
  const res = await fetch(`${API_BASE}/api/iam/users`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch IAM users: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchIAMRoles(): Promise<IAMRole[]> {
  const res = await fetch(`${API_BASE}/api/iam/roles`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch IAM roles: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchIAMGroups(): Promise<IAMGroup[]> {
  const res = await fetch(`${API_BASE}/api/iam/groups`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch IAM groups: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── SES ───────────────────────────────────────────────────────────────────────

export async function fetchSESIdentities(): Promise<SESIdentity[]> {
  const res = await fetch(`${API_BASE}/api/ses-identities`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch SES identities: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchSESSendingQuotas(): Promise<SESSendingQuota[]> {
  const res = await fetch(`${API_BASE}/api/ses-sending-quotas`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch SES sending quotas: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchSESAccountStats(): Promise<SESAccountStats[]> {
  const res = await fetch(`${API_BASE}/api/ses-account-stats`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch SES account stats: ${res.status} ${res.statusText}`);
  return res.json();
}
