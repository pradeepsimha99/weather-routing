import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App";
import { getHealth } from "./api/client";

// Free hosting puts the backend to sleep when it is idle. Pinging it as soon as the page
// opens wakes it while the user fills in the form. A failure here is harmless.
void getHealth().catch(() => undefined);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);