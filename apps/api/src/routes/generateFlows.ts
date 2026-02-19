import type { Request, Response } from "express";
import { getPlanDefinition, getAllPlanKeys, type PlanKey, type FlowBlueprint, type FlowTemplate } from "@flow/core";
import type { BrandProfile } from "../lib/brandAnalyzer.js";
import { generateFlowsForPlan } from "../lib/flowGenerator.js";
import { getAllTemplates } from "../lib/libraryStore.js";
import { parseFlowText } from "../lib/flowTextParser.js";

function templateToBlueprint(template: FlowTemplate): FlowBlueprint {
  return {
    flowId: template.id,
    name: template.name,
    triggerEvent: template.triggerEvent,
    emailCount: template.emailCount,
    smsCount: template.smsCount,
    hasSplit: template.hasSplit,
    splitCondition: template.splitCondition,
    splitSegments: template.splitSegments,
  };
}

async function buildCustomPlan(templateIds: string[]) {
  const allTemplates = await getAllTemplates();
  const flat = Object.values(allTemplates).flat();
  const selected: FlowTemplate[] = [];

  for (const id of templateIds) {
    const tpl = flat.find((t) => t.id === id);
    if (!tpl) throw new Error(`Template "${id}" not found in library.`);
    selected.push(tpl);
  }

  return {
    key: "custom" as PlanKey,
    name: "Custom Plan",
    price: "Custom",
    tagline: "Custom template selection",
    buildTime: "Varies",
    flows: selected.map(templateToBlueprint),
  };
}

export async function generateFlowsRoute(req: Request, res: Response) {
  try {
    const { planKey, brandProfile, customTemplateIds, customFlowText } = req.body as {
      planKey?: string;
      brandProfile?: BrandProfile;
      customTemplateIds?: string[];
      customFlowText?: string;
    };

    if (!brandProfile) {
      res.status(400).json({ error: "brandProfile is required." });
      return;
    }

    let plan;
    let resolvedPlanKey = planKey ?? "custom";

    if (customFlowText?.trim()) {
      plan = await parseFlowText(customFlowText.trim());
      resolvedPlanKey = "custom";
    } else if (customTemplateIds && customTemplateIds.length > 0) {
      plan = await buildCustomPlan(customTemplateIds);
      resolvedPlanKey = "custom";
    } else if (planKey) {
      const validKeys = getAllPlanKeys();
      if (!validKeys.includes(planKey as PlanKey)) {
        res.status(400).json({ error: `Invalid planKey. Must be one of: ${validKeys.join(", ")}` });
        return;
      }
      plan = getPlanDefinition(planKey as PlanKey);
    } else {
      res.status(400).json({ error: "planKey, customTemplateIds, or customFlowText is required." });
      return;
    }

    console.log(`Generating ${plan.flows.length} flows for plan "${plan.name}" / brand "${brandProfile.brandName}"...`);

    const flows = await generateFlowsForPlan(plan, brandProfile);

    console.log(`Done. Generated ${flows.length} flows.`);

    res.json({
      planKey: resolvedPlanKey,
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
