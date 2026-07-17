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
