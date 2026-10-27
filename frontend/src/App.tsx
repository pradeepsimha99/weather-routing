import { useState } from "react";
import { CheckpointTable } from "./components/CheckpointTable";
import { MapPanel } from "./components/MapPanel";
import { RecommendationBanner } from "./components/RecommendationBanner";
import { RouteList } from "./components/RouteList";
import { TripForm } from "./components/TripForm";
import { useTripAnalysis } from "./hooks/useTripAnalysis";
import type { AnalyzeRequest, AnalyzeResponse } from "./types";

/** The user's pick if it exists in this result, otherwise the recommended route. */
function resolveSelectedId(data: AnalyzeResponse | null, selectedId: string | null) {
  if (!data) {
    return null;
  }
  const stillValid = data.routes.some((route) => route.id === selectedId);
  return stillValid && selectedId ? selectedId : data.recommendation.route_id;
}

export default function App() {
  const { state, analyze } = useTripAnalysis();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const data = state.status === "success" ? state.data : null;
  const activeId = resolveSelectedId(data, selectedId);
  const activeRoute = data?.routes.find((route) => route.id === activeId) ?? null;

  const handleSubmit = (request: AnalyzeRequest) => {
    setSelectedId(null); // a new analysis starts from the recommended route
    void analyze(request);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Weather-Aware Truck Routing</h1>
        <p>Compare route options by weather risk, load weight and travel time.</p>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <TripForm
            isLoading={state.status === "loading"}
            serverErrors={state.status === "error" ? state.fieldErrors : {}}
            onSubmit={handleSubmit}
          />

          {state.status === "idle" && (
            <p className="hint">Enter a trip and choose “Analyze routes” to see the options.</p>
          )}
          {state.status === "error" && (
            <div className="alert" role="alert">
              {state.message}
            </div>
          )}
          {data && (
            <>
              <RecommendationBanner recommendation={data.recommendation} />
              <RouteList routes={data.routes} selectedId={activeId} onSelect={setSelectedId} />
            </>
          )}
        </aside>

        <main className="main">
          <MapPanel
            data={data}
            selectedId={activeId}
            isLoading={state.status === "loading"}
            onSelect={setSelectedId}
          />
          {activeRoute && <CheckpointTable route={activeRoute} />}
        </main>
      </div>
    </div>
  );
}