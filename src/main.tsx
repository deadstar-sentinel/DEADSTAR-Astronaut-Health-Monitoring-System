import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { BootOverlay, Landing } from "./sentinel/Landing.tsx";

const KEY = "sentinel-entered";

/** Cinematic scroll intro first (once per session), then a boot reveal into mission control. #app or /twin skips the intro. */
function Root() {
  const [entered, setEntered] = useState(() => {
    try {
      return (
        window.location.hash === "#app" ||
        window.location.hash === "#demo" ||
        window.location.pathname === "/twin" ||
        sessionStorage.getItem(KEY) === "1"
      );
    } catch {
      return false;
    }
  });
  const [boot, setBoot] = useState(false);
  if (!entered) {
    return (
      <Landing
        onEnter={() => {
          try {
            sessionStorage.setItem(KEY, "1");
          } catch {
            /* private mode: fine */
          }
          setBoot(true);
          setEntered(true);
        }}
      />
    );
  }
  return (
    <>
      <App />
      {boot && <BootOverlay />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
