import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "reactflow/dist/style.css";
import "./styles.css";
import "./styles/flow-nodes.css";
import App from "./App";
import { EmailPreviewPage } from "./pages/EmailPreviewPage";
import { EmailEditorPage } from "./pages/EmailEditorPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/email-preview/:nodeId" element={<EmailPreviewPage />} />
        <Route path="/email-editor/:nodeId" element={<EmailEditorPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
