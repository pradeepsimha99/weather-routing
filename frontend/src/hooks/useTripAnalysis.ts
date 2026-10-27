import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, analyzeTrip } from "../api/client";
import { toFieldErrors } from "../lib/validation";
import type { FieldErrors } from "../lib/validation";
import type { AnalyzeRequest, AnalyzeResponse } from "../types";

export type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: AnalyzeResponse }
  | { status: "error"; message: string; fieldErrors: FieldErrors };

export function useTripAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (request: AnalyzeRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading" });

    try {
      const data = await analyzeTrip(request, controller.signal);
      if (controller.signal.aborted) {
        return; // superseded by a newer request or the page was closed
      }
      setState({ status: "success", data });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (error instanceof ApiError) {
        const fieldErrors = toFieldErrors(error.fields);
        const hasFieldErrors = Object.keys(fieldErrors).length > 0;
        setState({
          status: "error",
          message: hasFieldErrors ? "Please correct the highlighted fields." : error.message,
          fieldErrors,
        });
      } else {
        setState({
          status: "error",
          message: "Something went wrong. Please try again.",
          fieldErrors: {},
        });
      }
    }
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, analyze };
}