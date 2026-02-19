import "dotenv/config";
import express from "express";
import cors from "cors";
import { analyzeBrandRoute } from "./routes/analyzeBrand.js";
import { generateFlowsRoute } from "./routes/generateFlows.js";
import {
  listAllTemplates,
  listTemplatesByType,
  createTemplateRoute,
  updateTemplateRoute,
  deleteTemplateRoute,
} from "./routes/library.js";
import { chatFlowRoute } from "./routes/chatFlow.js";
import { filloutLookupRoute } from "./routes/fillout.js";
import { seedLibraryIfEmpty } from "./lib/librarySeed.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/analyze-brand", analyzeBrandRoute);
app.post("/api/generate-flows", generateFlowsRoute);
app.post("/api/chat-flow", chatFlowRoute);
app.post("/api/fillout-lookup", filloutLookupRoute);

app.get("/api/library", listAllTemplates);
app.get("/api/library/:flowType", listTemplatesByType);
app.post("/api/library/:flowType", createTemplateRoute);
app.put("/api/library/:flowType/:templateId", updateTemplateRoute);
app.delete("/api/library/:flowType/:templateId", deleteTemplateRoute);

seedLibraryIfEmpty().catch((err) => console.warn("Library seed failed:", err));

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
