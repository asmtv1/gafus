import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { LiveTrainerApp } from "./LiveTrainerApp";
import "./style.css";
const mount = document.getElementById("root");
if (!mount) throw Error("Trainer root mount missing");
createRoot(mount).render(createElement(LiveTrainerApp));
