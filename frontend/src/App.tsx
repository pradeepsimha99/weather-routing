import { useEffect, useState } from "react";
import { getHealth } from "./api/client";

type Status = "checking" | "connected" | "unreachable";

export default function App() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    getHealth()
      .then(() => setStatus("connected"))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Weather-Aware Truck Routing</h1>
      <p>
        Backend status: <strong data-testid="backend-status">{status}</strong>
      </p>
    </main>
  );
}