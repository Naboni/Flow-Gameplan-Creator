import type { Request, Response } from "express";
import { analyzeBrand } from "../lib/brandAnalyzer.js";

export async function analyzeBrandRoute(req: Request, res: Response) {
  try {
    const { websiteUrl, brandName, notes } = req.body as {
      websiteUrl?: string;
      brandName?: string;
      notes?: string;
    };

    if (!websiteUrl || !brandName) {
      res.status(400).json({ error: "websiteUrl and brandName are required." });
      return;
    }

    const profile = await analyzeBrand(websiteUrl, brandName, notes);
    res.json({ profile });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("analyze-brand error:", message);
    res.status(500).json({ error: message });
  }
}
