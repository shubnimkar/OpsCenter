const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

export { API_BASE };

export async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (API_KEY) {
    headers.set("X-API-Key", API_KEY);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  return fetch(url, { ...init, headers });
}
