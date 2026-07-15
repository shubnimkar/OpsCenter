import { Instance } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchInstances(): Promise<Instance[]> {
  const res = await fetch(`${API_BASE}/api/instances`, {
    next: { revalidate: 0 }, // always fresh on client fetches
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch instances: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
