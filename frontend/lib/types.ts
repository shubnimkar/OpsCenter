export interface Instance {
  Profile: string;
  Name: string;
  State: string;
  "Instance ID": string;
  "Instance Type": string;
  "Public IP": string;
  "Private IP": string;
  "Public DNS": string;
  AZ: string;
}

export interface Profile {
  id: number;
  name: string;
  region: string;
}

export interface ProfileCreate {
  name: string;
  access_key: string;
  secret_key: string;
  region: string;
}
