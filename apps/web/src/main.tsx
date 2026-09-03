import { createRoot } from "react-dom/client";
import { getConsoleFunction, setConsoleFunction } from "three";
import { AppRoot } from "./app-root.js";
import "./styles.css";

type ThreeConsoleType = "log" | "warn" | "error";
type ThreeConsoleFunction = (type: ThreeConsoleType, message: string, ...params: unknown[]) => void;

const previousThreeConsole = getConsoleFunction() as ThreeConsoleFunction | null;
const forwardThreeConsole: ThreeConsoleFunction = previousThreeConsole ?? ((type, message, ...params) => {
  if (type === "warn") globalThis.console.warn(message, ...params);
  else if (type === "error") globalThis.console.error(message, ...params);
  else globalThis.console.info(message, ...params);
});

// R3F 9.7 still creates THREE.Clock internally; filter only its known deprecation notice.
setConsoleFunction((type, message, ...params) => {
  if (type === "warn" && message === "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.") return;
  forwardThreeConsole(type, message, ...params);
});

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Brick Builder root element is missing");
}

createRoot(root).render(<AppRoot />);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js").then((registration) => registration.update()).catch(() => undefined); });
}
