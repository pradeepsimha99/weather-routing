/**
 * Thin API client. All backend calls go through here so the base URL
 * and error handling live in exactly one place.
 */

import type { AnalyzeRequest, AnalyzeResponse } from "../types";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

/** Trim the configured backend address and drop trailing slashes, so paths join cleanly. */
export function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = (value ?? "").trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_API_BASE_URL;
}

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

export class ApiError extends Error {
  readonly status: number;
  /** Per-field validation messages from the backend (empty for other errors). */
  readonly fields: Record<string, string[]>;

  constructor(message: string, status: number, fields: Record<string, string[]> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

interface ErrorBody {
  error?: string;
  fields?: Record<string, string[]>;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorBody;
    return new ApiError(
      body.error ?? `Request failed (${response.status}).`,
      response.status,
      body.fields,
    );
  } catch {
    return new ApiError(`Request failed (${response.status}).`, response.status);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error; // a deliberately cancelled request is not a failure
    }
    throw new ApiError("Cannot reach the server. Check your connection and try again.", 0);
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

export interface HealthResponse {
  status: string;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health/");
}

export function analyzeTrip(
  payload: AnalyzeRequest,
  signal?: AbortSignal,
): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>("/api/analyze/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}