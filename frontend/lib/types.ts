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
}

export type EnvTag = "prod" | "staging" | "dev" | "sandbox" | "other";

export interface Profile {
  id: number;
  name: string;
  region: string;
  color: string;
  env_tag: EnvTag;
}

export interface ProfileCreate {
  name: string;
  access_key: string;
  secret_key: string;
  region: string;
  color: string;
  env_tag: EnvTag;
}
