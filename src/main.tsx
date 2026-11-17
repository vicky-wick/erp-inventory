import App from "@/app/router";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");

createRoot(root).render(<App />);
