import { getDataModeLabel, isMockEnabled } from "@/lib/mock-toggle";

const apiBaseUrl = process.env.NEXT_PUBLIC_KICETIC_API_BASE_URL ?? "http://127.0.0.1:8005";

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export async function apiClient<T>(path: string, init?: RequestInit): Promise<T> {
  if (isMockEnabled()) {
    throw new Error(`Mock mode is enabled for ${path}. Current API target: ${apiBaseUrl}`);
  }

  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as { detail?: string };
      detail = payload.detail ?? "";
    } catch {
      detail = "";
    }
    const suffix = detail ? ` · ${detail}` : "";
    throw new Error(`API ${response.status} ${response.statusText} in ${getDataModeLabel()} mode @ ${apiBaseUrl}${suffix}`);
  }

  return (await response.json()) as T;
}
