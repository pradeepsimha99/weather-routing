import { describe, expect, it, vi } from "vitest";
import { REQUEST, makeAnalyzeResponse } from "../test/fixtures";
import { ApiError, analyzeTrip, getHealth } from "./client";

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  } as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("analyzeTrip", () => {
  it("posts the trip as JSON and returns the parsed answer", async () => {
    const response = makeAnalyzeResponse();
    const fetchMock = stubFetch(response);
    const controller = new AbortController();

    const result = await analyzeTrip(REQUEST, controller.signal);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/analyze\/$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(REQUEST);
    expect(init.signal).toBe(controller.signal);
    expect(result).toEqual(response);
  });

  it("turns a validation error into an ApiError with field messages", async () => {
    stubFetch(
      { error: "Invalid input.", fields: { origin: ["This field may not be blank."] } },
      400,
    );

    const error = await captureError(analyzeTrip(REQUEST));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: "Invalid input.",
      status: 400,
      fields: { origin: ["This field may not be blank."] },
    });
  });

  it("uses the backend's message for other errors", async () => {
    stubFetch({ error: 'Could not find a location matching "Atlantis".' }, 404);

    const error = await captureError(analyzeTrip(REQUEST));

    expect(error).toMatchObject({
      message: 'Could not find a location matching "Atlantis".',
      status: 404,
      fields: {},
    });
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const error = await captureError(analyzeTrip(REQUEST));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Request failed (500).", status: 500 });
  });

  it("reports an unreachable server with status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await captureError(analyzeTrip(REQUEST));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0 });
    expect((error as ApiError).message).toContain("Cannot reach the server");
  });

  it("lets a deliberate cancellation through unchanged", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));

    const error = await captureError(analyzeTrip(REQUEST));

    expect(error).toBe(abort);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

describe("getHealth", () => {
  it("returns the health payload", async () => {
    const fetchMock = stubFetch({ status: "ok" });

    expect(await getHealth()).toEqual({ status: "ok" });
    expect((fetchMock.mock.calls[0] as [string])[0]).toMatch(/\/api\/health\/$/);
  });
});