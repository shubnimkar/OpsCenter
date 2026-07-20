export interface Instance {
  Profile: string;
  ProfileColor: string;
  ProfileEnvTag: EnvTag;
  Name: string;
  State: string;
  "Instance ID": string;
  "Instance Type": string;
  "Public IP": string;
  "Private IP": string;
  "Public DNS": string;
  AZ: string;
  CachedAt?: string; // ISO timestamp of when the cache row was last written
}

export type EnvTag = "prod" | "staging" | "dev" | "sandbox" | "other";

export interface Profile {
  id: number;
  name: string;
  regions: string[];
  color: string;
  env_tag: EnvTag;
  /** Resolved AWS Account ID — populated after a successful connection test */
  account_id?: string | null;
  /** ISO timestamp of the last connection test (stored in DB) */
  last_tested_at?: string | null;
  /** Whether the last connection test succeeded (stored in DB) */
  last_test_ok?: boolean | null;
}

export interface ProfileSummary {
  ec2_count: number;
  s3_count: number;
  lambda_count: number;
  iam_user_count: number;
}

export interface ProfileCreate {
  name: string;
  access_key: string;
  secret_key: string;
  regions: string[];
  color: string;
  env_tag: EnvTag;
}

export interface S3Bucket {
  BucketName: string;
  Profile: string;
  ProfileColor: string;
  ProfileEnvTag: EnvTag;
  Region: string;
  CreationDate: string | null;
  CachedAt?: string;
}

export interface LambdaFunction {
  FunctionName: string;
  Profile: string;
  ProfileColor: string;
  ProfileEnvTag: EnvTag;
  Region: string;
  Runtime: string;
  Handler: string;
  State: string;
  LastModified: string | null;
  CodeSize: number;
  MemorySize: number;
  Timeout: number;
  Description: string;
  CachedAt?: string;
}

export interface InlinePolicy {
  name: string;
  document: Record<string, unknown>;
}

export interface AccessKeyDetail {
  access_key_id: string;
  status: "Active" | "Inactive" | string;
  created_at: string | null;
  last_used_date: string | null;
  last_used_service: string | null;
  last_used_region: string | null;
}

export interface IAMUser {
  Username: string;
  Profile: string;
  ProfileColor: string;
  ProfileEnvTag: EnvTag;
  UserId: string;
  Arn: string;
  Path: string;
  CreatedAt: string | null;
  PasswordLastUsed: string | null;
  PasswordCreatedAt: string | null;
  LastActivity: string | null;
  MfaEnabled: boolean;
  ConsoleAccess: boolean;
  AccessKeyCount: number;
  ActiveKeyCount: number;
  AccessKeysDetail: AccessKeyDetail[];
  Groups: string[];
  AttachedPolicies: string[];
  InlinePolicies: InlinePolicy[];
  CachedAt?: string;
}

export interface IAMRole {
  RoleName: string;
  Profile: string;
  ProfileColor: string;
  ProfileEnvTag: EnvTag;
  RoleId: string;
  Arn: string;
  Path: string;
  CreatedAt: string | null;
  Description: string;
  MaxSessionDuration: number;
  AttachedPolicies: string[];
  TrustedServices: string[];
  CachedAt?: string;
}

export interface IAMGroup {
  GroupName: string;
  Profile: string;
  ProfileColor: string;
  ProfileEnvTag: EnvTag;
  GroupId: string;
  Arn: string;
  Path: string;
  CreatedAt: string | null;
  MemberCount: number;
  AttachedPolicies: string[];
  CachedAt?: string;
}

export interface SESIdentity {
  Identity: string;
  IdentityType: "EmailAddress" | "Domain";
  Profile: string;
  ProfileColor: string;
  ProfileEnvTag: EnvTag;
  Region: string;
  VerificationStatus: string;
  DkimEnabled: boolean;
  DkimVerificationStatus: string;
  BounceTopicArn: string | null;
  ComplaintTopicArn: string | null;
  DeliveryTopicArn: string | null;
  ForwardingEnabled: boolean;
  CachedAt?: string;
}

export interface SESSendingQuota {
  Profile: string;
  ProfileColor: string;
  ProfileEnvTag: EnvTag;
  Region: string;
  Max24HourSend: number;
  MaxSendRate: number;
  SentLast24Hours: number;
  CachedAt?: string;
}

export interface SESAccountStats {
  Profile: string;
  ProfileColor: string;
  ProfileEnvTag: EnvTag;
  Region: string;
  SendingEnabled: boolean;
  InSandbox: boolean;
  Max24HourSend: number;
  TotalDeliveryAttempts: number;
  TotalBounces: number;
  TotalComplaints: number;
  TotalRejects: number;
  CachedAt?: string;
}

export interface Route53Zone {
  ZoneId: string;
  Name: string;
  Profile: string;
  ProfileColor: string;
  ProfileEnvTag: EnvTag;
  PrivateZone: boolean;
  Comment: string;
  RecordCount: number;
  CallerReference: string;
  Tags: Record<string, string>;
  CachedAt?: string;
}

export interface Route53Record {
  ZoneId: string;
  RecordName: string;
  RecordType: string;
  Profile: string;
  ProfileColor: string;
  ProfileEnvTag: EnvTag;
  TTL: number | null;
  Values: string[];
  AliasTarget: string | null;
  SetIdentifier: string;
  Weight: number | null;
  Region: string;
  Failover: string;
  CachedAt?: string;
}

// ── SSL Certificate Monitoring ─────────────────────────────────────────────

export type SSLStatus = "valid" | "expiring_soon" | "expired" | "error" | "unknown";

export interface SSLCertificate {
  id: number;
  domain_name: string;
  port: number;
  environment: "production" | "uat" | "development";
  owner: string;
  notes: string;
  issuer: string;
  valid_from: string | null;
  expiry_date: string | null;
  days_remaining: number | null;
  status: SSLStatus;
  san_list: string[];
  key_algorithm: string;
  last_checked: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSLDomainCreate {
  domain_name: string;
  port?: number;
  environment?: string;
  owner?: string;
  notes?: string;
}

export interface SSLDomainUpdate {
  domain_name?: string;
  port?: number;
  environment?: string;
  owner?: string;
  notes?: string;
}


// ── Website Uptime Monitor ──────────────────────────────────────────────────

export type UptimeStatus =
  | "online"
  | "offline"
  | "degraded"
  | "maintenance"
  | "content_validation_failed"
  | "unknown";

export type UptimeEnvironment = "production" | "test" | "development";

export interface WebsiteMonitor {
  id: number;
  name: string;
  url: string;
  environment: UptimeEnvironment;
  monitoring_interval: number;     // seconds
  timeout_seconds: number;
  expected_status: number;
  keyword: string;
  maintenance_mode: boolean;
  notes: string;
  // Latest check snapshot
  last_status: UptimeStatus;
  last_http_status: number | null;
  last_response_time: number | null;
  last_checked_at: string | null;
  next_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebsiteCreate {
  name: string;
  url: string;
  environment?: UptimeEnvironment;
  monitoring_interval?: number;
  timeout_seconds?: number;
  expected_status?: number;
  keyword?: string;
  maintenance_mode?: boolean;
  notes?: string;
}

export interface WebsiteUpdate {
  name?: string;
  url?: string;
  environment?: UptimeEnvironment;
  monitoring_interval?: number;
  timeout_seconds?: number;
  expected_status?: number;
  keyword?: string;
  maintenance_mode?: boolean;
  notes?: string;
}

export interface WebsiteHistoryRecord {
  id: number;
  website_id: number;
  status: UptimeStatus;
  http_status: number | null;
  response_time_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

export interface WebsiteStats {
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
  avg_ms: number | null;
  min_ms: number | null;
  max_ms: number | null;
  chart_24h: { t: string; ms: number }[];
  chart_7d: { t: string; ms: number }[];
  chart_30d: { t: string; ms: number }[];
}
