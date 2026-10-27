import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, analyzeTrip } from "../api/client";
import { REQUEST, makeAnalyzeResponse } from "../test/fixtures";
import type { AnalyzeResponse } from "../types";
import { useTripAnalysis } from "./useTripAnalysis";

vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  analyzeTrip: vi.fn(),
}));

const analyzeMock = vi.mocked(analyzeTrip);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  analyzeMock.mockReset();
});

describe("useTripAnalysis", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useTripAnalysis());

    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("goes through loading to success", async () => {
    const data = makeAnalyzeResponse();
    const pending = deferred<AnalyzeResponse>();
    analyzeMock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useTripAnalysis());

    act(() => {
      void result.current.analyze(REQUEST);
    });
    expect(result.current.state).toEqual({ status: "loading" });

    await act(async () => {
      pending.resolve(data);
      await pending.promise;
    });
    expect(result.current.state).toEqual({ status: "success", data });
    expect(analyzeMock).toHaveBeenCalledWith(REQUEST, expect.any(AbortSignal));
  });

  it("reports field errors from the backend", async () => {
    analyzeMock.mockRejectedValue(
      new ApiError("Invalid input.", 400, { load_weight_lb: ["Too heavy."] }),
    );
    const { result } = renderHook(() => useTripAnalysis());

    await act(async () => {
      await result.current.analyze(REQUEST);
    });

    expect(result.current.state).toEqual({
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: { load_weight_lb: "Too heavy." },
    });
  });

  it("shows the backend's message for other API errors", async () => {
    analyzeMock.mockRejectedValue(new ApiError("The routing service is unavailable.", 502));
    const { result } = renderHook(() => useTripAnalysis());

    await act(async () => {
      await result.current.analyze(REQUEST);
    });

    expect(result.current.state).toEqual({
      status: "error",
      message: "The routing service is unavailable.",
      fieldErrors: {},
    });
  });

  it("uses a generic message for unexpected errors", async () => {
    analyzeMock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useTripAnalysis());

    await act(async () => {
      await result.current.analyze(REQUEST);
    });

    expect(result.current.state).toEqual({
      status: "error",
      message: "Something went wrong. Please try again.",
      fieldErrors: {},
    });
  });

  it("ignores a response that arrives after a newer request was started", async () => {
    const stale = makeAnalyzeResponse();
    const fresh = { ...makeAnalyzeResponse(), load_weight_lb: 10_000 };
    const first = deferred<AnalyzeResponse>();
    const second = deferred<AnalyzeResponse>();
    analyzeMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useTripAnalysis());

    let firstCall: Promise<void> = Promise.resolve();
    let secondCall: Promise<void> = Promise.resolve();
    await act(async () => {
      firstCall = result.current.analyze(REQUEST);
    });
    await act(async () => {
      secondCall = result.current.analyze({ ...REQUEST, load_weight_lb: 10_000 });
    });
    await act(async () => {
      second.resolve(fresh);
      await secondCall;
    });
    await act(async () => {
      first.resolve(stale);
      await firstCall;
    });

    expect(result.current.state).toEqual({ status: "success", data: fresh });
  });

  it("cancels the request in flight when the component unmounts", () => {
    analyzeMock.mockReturnValue(new Promise<AnalyzeResponse>(() => undefined));
    const { result, unmount } = renderHook(() => useTripAnalysis());

    act(() => {
      void result.current.analyze(REQUEST);
    });
    const signal = analyzeMock.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });
});