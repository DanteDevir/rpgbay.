import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { PrintAddressPage } from "./PrintAddressPage";
import "./style.css";
const font = localStorage.getItem("rpgbay-font");
if (font) document.documentElement.style.fontSize = font;
const addressToken = window.location.pathname.match(
  /^\/print\/address\/([A-Za-z0-9_-]{20,200})$/,
)?.[1];
createRoot(document.getElementById("root")!).render(
  addressToken ? <PrintAddressPage token={addressToken} /> : <App />,
);
