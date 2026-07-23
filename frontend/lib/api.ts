import {
  Instance,
  Profile,
  ProfileCreate,
  ProfileSummary,
  S3Bucket,
  LambdaFunction,
  IAMUser,
  IAMRole,
  IAMGroup,
  SESIdentity,
  SESSendingQuota,
  SESAccountStats,
  Route53Zone,
  Route53Record,
  SSLCertificate,
  SSLDomainCreate,
  SSLDomainUpdate,
  WebsiteMonitor,
  WebsiteCreate,
  WebsiteUpdate,
  WebsiteHistoryRecord,
  WebsiteStats,
} from "./types";
import { fetchApi } from "./fetchApi";

export { API_BASE } from "./fetchApi";

export async function fetchInstances(): Promise<Instance[]> {
  const res = await fetchApi("/api/instances", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch instances: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchS3Buckets(): Promise<S3Bucket[]> {
  const res = await fetchApi("/api/s3-buckets", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch S3 buckets: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchLambdas(): Promise<LambdaFunction[]> {
  const res = await fetchApi("/api/lambdas", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch Lambda functions: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchProfiles(): Promise<Profile[]> {
  const res = await fetchApi("/api/profiles");
  if (!res.ok) throw new Error(`Failed to fetch profiles: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function createProfile(data: ProfileCreate): Promise<Profile> {
  const res = await fetchApi("/api/profiles", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to create profile: ${res.status}`);
  }
  return res.json();
}

export async function updateProfile(id: number, data: Partial<ProfileCreate>): Promise<Profile> {
  const res = await fetchApi(`/api/profiles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to update profile: ${res.status}`);
  }
  return res.json();
}

export async function deleteProfile(id: number): Promise<void> {
  const res = await fetchApi(`/api/profiles/${id}`, { method: "DELETE" });
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
  const res = await fetchApi("/api/profiles/test-connection", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function testSavedProfile(id: number): Promise<ConnectionTestResult> {
  const res = await fetchApi(`/api/profiles/${id}/test-connection`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchProfileSummary(id: number): Promise<ProfileSummary> {
  const res = await fetchApi(`/api/profiles/${id}/summary`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch profile summary: ${res.status}`);
  return res.json();
}

export async function reorderProfiles(orderedIds: number[]): Promise<void> {
  const res = await fetchApi("/api/profiles/reorder", {
    method: "PATCH",
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
  const res = await fetchApi("/api/scheduler/status", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch scheduler status: ${res.status}`);
  return res.json();
}

export async function triggerSchedulerPoll(): Promise<{ triggered: boolean; message: string }> {
  const res = await fetchApi("/api/scheduler/trigger", { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Trigger failed: ${res.status}`);
  }
  return res.json();
}

export async function updateSchedulerInterval(seconds: number): Promise<SchedulerStatus> {
  const res = await fetchApi("/api/scheduler/config", {
    method: "PATCH",
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
  const res = await fetchApi("/api/iam/users", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch IAM users: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchIAMRoles(): Promise<IAMRole[]> {
  const res = await fetchApi("/api/iam/roles", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch IAM roles: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchIAMGroups(): Promise<IAMGroup[]> {
  const res = await fetchApi("/api/iam/groups", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch IAM groups: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── SES ───────────────────────────────────────────────────────────────────────

export async function fetchSESIdentities(): Promise<SESIdentity[]> {
  const res = await fetchApi("/api/ses-identities", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch SES identities: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchSESSendingQuotas(): Promise<SESSendingQuota[]> {
  const res = await fetchApi("/api/ses-sending-quotas", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch SES sending quotas: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchSESAccountStats(): Promise<SESAccountStats[]> {
  const res = await fetchApi("/api/ses-account-stats", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch SES account stats: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── Route 53 ─────────────────────────────────────────────────────────────────

export async function fetchRoute53Zones(): Promise<Route53Zone[]> {
  const res = await fetchApi("/api/route53/zones", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch Route 53 zones: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchRoute53Records(zoneId?: string): Promise<Route53Record[]> {
  const path = zoneId
    ? `/api/route53/records?zone_id=${encodeURIComponent(zoneId)}`
    : "/api/route53/records";
  const res = await fetchApi(path, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch Route 53 records: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── SSL Certificate Monitoring ─────────────────────────────────────────────

export async function fetchSSLCertificates(): Promise<SSLCertificate[]> {
  const res = await fetchApi("/api/ssl-certificates", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch SSL certificates: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function createSSLCertificate(data: SSLDomainCreate): Promise<SSLCertificate> {
  const res = await fetchApi("/api/ssl-certificates", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to create domain: ${res.status}`);
  }
  return res.json();
}

export async function updateSSLCertificate(id: number, data: SSLDomainUpdate): Promise<SSLCertificate> {
  const res = await fetchApi(`/api/ssl-certificates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to update domain: ${res.status}`);
  }
  return res.json();
}

export async function deleteSSLCertificate(id: number): Promise<void> {
  const res = await fetchApi(`/api/ssl-certificates/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to delete domain: ${res.status}`);
  }
}

export async function refreshSSLCertificate(id: number): Promise<{ triggered: boolean; message: string }> {
  const res = await fetchApi(`/api/ssl-certificates/${id}/refresh`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to refresh domain: ${res.status}`);
  }
  return res.json();
}

// ── Website Uptime Monitor ──────────────────────────────────────────────────

export async function fetchWebsites(): Promise<WebsiteMonitor[]> {
  const res = await fetchApi("/api/uptime/websites", { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch websites: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function createWebsite(data: WebsiteCreate): Promise<WebsiteMonitor> {
  const res = await fetchApi("/api/uptime/websites", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to create website: ${res.status}`);
  }
  return res.json();
}

export async function updateWebsite(id: number, data: WebsiteUpdate): Promise<WebsiteMonitor> {
  const res = await fetchApi(`/api/uptime/websites/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to update website: ${res.status}`);
  }
  return res.json();
}

export async function deleteWebsite(id: number): Promise<void> {
  const res = await fetchApi(`/api/uptime/websites/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to delete website: ${res.status}`);
  }
}

export async function refreshWebsite(id: number): Promise<{ triggered: boolean; message: string }> {
  const res = await fetchApi(`/api/uptime/websites/${id}/refresh`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to refresh website: ${res.status}`);
  }
  return res.json();
}

export async function fetchWebsiteHistory(id: number, limit = 200): Promise<WebsiteHistoryRecord[]> {
  const res = await fetchApi(`/api/uptime/websites/${id}/history?limit=${limit}`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Failed to fetch history: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchWebsiteStats(id: number): Promise<WebsiteStats> {
  const res = await fetchApi(`/api/uptime/websites/${id}/stats`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── Notifications ──────────────────────────────────────────────────────────────

import {
  NotificationsResponse,
  NotificationSettings,
  NotificationRecipient,
} from "./types";

export async function fetchNotifications(
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationsResponse> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.unreadOnly) params.set("unread_only", "true");
  const res = await fetchApi(`/api/notifications?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`);
  return res.json();
}

export async function markNotificationRead(id: number): Promise<void> {
  const res = await fetchApi(`/api/notifications/${id}/read`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to mark read: ${res.status}`);
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetchApi("/api/notifications/read-all", { method: "POST" });
  if (!res.ok) throw new Error(`Failed to mark all read: ${res.status}`);
}

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const res = await fetchApi("/api/notifications/settings");
  if (!res.ok) throw new Error(`Failed to fetch notification settings: ${res.status}`);
  return res.json();
}

export async function updateNotificationSettings(
  data: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const res = await fetchApi("/api/notifications/settings", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to update settings: ${res.status}`);
  }
  return res.json();
}

export async function fetchNotificationRecipients(): Promise<NotificationRecipient[]> {
  const res = await fetchApi("/api/notifications/recipients");
  if (!res.ok) throw new Error(`Failed to fetch recipients: ${res.status}`);
  return res.json();
}

export async function addNotificationRecipient(
  email: string,
): Promise<NotificationRecipient> {
  const res = await fetchApi("/api/notifications/recipients", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to add recipient: ${res.status}`);
  }
  return res.json();
}

export async function deleteNotificationRecipient(id: number): Promise<void> {
  const res = await fetchApi(`/api/notifications/recipients/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to delete recipient: ${res.status}`);
  }
}

export async function sendTestEmail(): Promise<{ sent: boolean; recipients: string[] }> {
  const res = await fetchApi("/api/notifications/test-email", { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Test email failed: ${res.status}`);
  }
  return res.json();
}
