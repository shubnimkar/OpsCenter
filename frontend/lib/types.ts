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
