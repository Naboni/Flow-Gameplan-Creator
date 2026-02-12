import type { Request, Response } from "express";
import { getPlanDefinition, getAllPlanKeys, type PlanKey } from "@flow/core";
import type { BrandProfile } from "../lib/brandAnalyzer.js";
import { generateFlowsForPlan } from "../lib/flowGenerator.js";

export async function generateFlowsRoute(req: Request, res: Response) {
  try {
    const { planKey, brandProfile } = req.body as {
      planKey?: string;
      brandProfile?: BrandProfile;
    };

    if (!planKey || !brandProfile) {
      res.status(400).json({ error: "planKey and brandProfile are required." });
      return;
    }

    const validKeys = getAllPlanKeys();
    if (!validKeys.includes(planKey as PlanKey)) {
      res.status(400).json({ error: `Invalid planKey. Must be one of: ${validKeys.join(", ")}` });
      return;
    }

    const plan = getPlanDefinition(planKey as PlanKey);

    console.log(`Generating ${plan.flows.length} flows for plan "${plan.name}" / brand "${brandProfile.brandName}"...`);

    const flows = await generateFlowsForPlan(plan, brandProfile);

    console.log(`Done. Generated ${flows.length} flows.`);

    res.json({
      planKey,
      planName: plan.name,
      brandName: brandProfile.brandName,
      flowCount: flows.length,
      flows
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("generate-flows error:", message);
    res.status(500).json({ error: message });
  }
}
