/**
 * Thin API client. All backend calls go through here so the base URL
 * and error handling live in exactly one place.
 */

const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new ApiError(`Request failed: ${response.statusText}`, response.status);
  }
  return (await response.json()) as T;
}

export interface HealthResponse {
  status: string;
}

export function getHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>("/api/health/");
}