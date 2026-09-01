import { createRoot } from "react-dom/client";
import { AppRoot } from "./app-root.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Brick Builder root element is missing");
}

createRoot(root).render(<AppRoot />);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("./sw.js"); });
}
