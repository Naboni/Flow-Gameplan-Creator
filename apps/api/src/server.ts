import "dotenv/config";
import express from "express";
import cors from "cors";
import { analyzeBrandRoute } from "./routes/analyzeBrand.js";
import { generateFlowsRoute } from "./routes/generateFlows.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

/* health check */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

/* routes */
app.post("/api/analyze-brand", analyzeBrandRoute);
app.post("/api/generate-flows", generateFlowsRoute);

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
