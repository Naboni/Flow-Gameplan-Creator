import type { Request, Response } from "express";
import type { BrandProfile } from "../lib/brandAnalyzer.js";
import { generateFlowsForPlan } from "../lib/flowGenerator.js";

/* ── inline plan registry (mirrors libs/core/src/plans/planRegistry.ts) ── */

type PlanKey = "core-foundation" | "growth-engine" | "full-system";

type FlowBlueprint = {
  flowId: string;
  name: string;
  triggerEvent: string;
  emailCount: number;
  smsCount: number;
  hasSplit: boolean;
  splitCondition?: string;
  splitSegments?: { yes: { email: number; sms: number }; no: { email: number; sms: number } };
  mirrorsFlow?: string;
  structureNote?: string;
};

type PlanDefinition = {
  key: PlanKey;
  name: string;
  flows: FlowBlueprint[];
};

const PLANS: Record<PlanKey, PlanDefinition> = {
  "core-foundation": {
    key: "core-foundation",
    name: "Core Foundation",
    flows: [
      { flowId: "core_email_welcome", name: "Email Welcome", triggerEvent: "When someone subscribes to the email list", emailCount: 3, smsCount: 0, hasSplit: false },
      { flowId: "core_sms_welcome", name: "SMS Welcome", triggerEvent: "When someone opts in to SMS", emailCount: 0, smsCount: 2, hasSplit: false },
      { flowId: "core_checkout_abandonment", name: "Checkout Abandonment", triggerEvent: "When someone starts checkout but does not purchase", emailCount: 2, smsCount: 2, hasSplit: false },
      { flowId: "core_cart_abandonment", name: "Cart Abandonment", triggerEvent: "When someone adds to cart but does not purchase", emailCount: 2, smsCount: 2, hasSplit: false, mirrorsFlow: "core_checkout_abandonment" },
      { flowId: "core_browse_abandonment", name: "Browse Abandonment", triggerEvent: "When someone views products but does not add to cart", emailCount: 2, smsCount: 2, hasSplit: false },
      { flowId: "core_post_purchase", name: "Post-Purchase", triggerEvent: "When someone completes a purchase", emailCount: 1, smsCount: 1, hasSplit: false }
    ]
  },
  "growth-engine": {
    key: "growth-engine",
    name: "Growth Engine",
    flows: [
      { flowId: "growth_email_welcome", name: "Email Welcome", triggerEvent: "When someone subscribes to the email list", emailCount: 4, smsCount: 0, hasSplit: true, splitCondition: "Has placed order (purchaser vs non-purchaser)", splitSegments: { yes: { email: 1, sms: 0 }, no: { email: 3, sms: 0 } } },
      { flowId: "growth_sms_welcome", name: "SMS Welcome", triggerEvent: "When someone opts in to SMS", emailCount: 0, smsCount: 3, hasSplit: true, splitCondition: "Has placed order (purchaser vs non-purchaser)", splitSegments: { yes: { email: 0, sms: 1 }, no: { email: 0, sms: 2 } } },
      { flowId: "growth_checkout_abandonment", name: "Checkout Abandonment", triggerEvent: "When someone starts checkout but does not purchase", emailCount: 6, smsCount: 4, hasSplit: true, splitCondition: "Purchase history", splitSegments: { yes: { email: 3, sms: 2 }, no: { email: 3, sms: 2 } } },
      { flowId: "growth_cart_abandonment", name: "Cart Abandonment", triggerEvent: "When someone adds to cart but does not purchase", emailCount: 6, smsCount: 4, hasSplit: true, splitCondition: "Purchase history", splitSegments: { yes: { email: 3, sms: 2 }, no: { email: 3, sms: 2 } }, mirrorsFlow: "growth_checkout_abandonment" },
      { flowId: "growth_browse_abandonment", name: "Browse Abandonment", triggerEvent: "When someone views products but does not add to cart", emailCount: 6, smsCount: 4, hasSplit: true, splitCondition: "Purchase history", splitSegments: { yes: { email: 3, sms: 2 }, no: { email: 3, sms: 2 } } },
      { flowId: "growth_site_abandonment", name: "Site Abandonment", triggerEvent: "When someone visits the site but does not view products", emailCount: 2, smsCount: 0, hasSplit: false },
      { flowId: "growth_post_purchase", name: "Post-Purchase", triggerEvent: "When someone completes a purchase", emailCount: 3, smsCount: 2, hasSplit: true, splitCondition: "Product or purchase history", structureNote: "Brand-dependent, typically split by product or purchase history" },
      { flowId: "growth_winback", name: "Winback", triggerEvent: "When someone has not purchased in 60+ days", emailCount: 2, smsCount: 0, hasSplit: false }
    ]
  },
  "full-system": {
    key: "full-system",
    name: "Full System",
    flows: [
      { flowId: "full_email_welcome", name: "Email Welcome", triggerEvent: "When someone subscribes to the email list", emailCount: 6, smsCount: 0, hasSplit: true, splitCondition: "Has placed order (purchaser vs non-purchaser)", splitSegments: { yes: { email: 2, sms: 0 }, no: { email: 4, sms: 0 } } },
      { flowId: "full_sms_welcome", name: "SMS Welcome", triggerEvent: "When someone opts in to SMS", emailCount: 0, smsCount: 4, hasSplit: true, splitCondition: "Has placed order (purchaser vs non-purchaser)", splitSegments: { yes: { email: 0, sms: 1 }, no: { email: 0, sms: 3 } } },
      { flowId: "full_checkout_abandonment", name: "Checkout Abandonment", triggerEvent: "When someone starts checkout but does not purchase", emailCount: 8, smsCount: 4, hasSplit: true, splitCondition: "Purchase history", splitSegments: { yes: { email: 4, sms: 2 }, no: { email: 4, sms: 2 } } },
      { flowId: "full_cart_abandonment", name: "Cart Abandonment", triggerEvent: "When someone adds to cart but does not purchase", emailCount: 8, smsCount: 4, hasSplit: true, splitCondition: "Purchase history", splitSegments: { yes: { email: 4, sms: 2 }, no: { email: 4, sms: 2 } }, mirrorsFlow: "full_checkout_abandonment" },
      { flowId: "full_browse_abandonment", name: "Browse Abandonment", triggerEvent: "When someone views products but does not add to cart", emailCount: 8, smsCount: 4, hasSplit: true, splitCondition: "Purchase history", splitSegments: { yes: { email: 4, sms: 2 }, no: { email: 4, sms: 2 } } },
      { flowId: "full_site_abandonment", name: "Site Abandonment", triggerEvent: "When someone visits the site but does not view products", emailCount: 3, smsCount: 0, hasSplit: false },
      { flowId: "full_post_purchase", name: "Post-Purchase", triggerEvent: "When someone completes a purchase", emailCount: 6, smsCount: 3, hasSplit: true, splitCondition: "Product or purchase history", structureNote: "Brand-dependent, typically split by product or purchase history" },
      { flowId: "full_winback", name: "Winback", triggerEvent: "When someone has not purchased in 60+ days", emailCount: 6, smsCount: 0, hasSplit: true, splitCondition: "Purchase history", splitSegments: { yes: { email: 3, sms: 0 }, no: { email: 3, sms: 0 } } },
      { flowId: "full_sunset", name: "Sunset", triggerEvent: "When someone has not engaged in 90+ days", emailCount: 3, smsCount: 0, hasSplit: false }
    ]
  }
};

/* ── route handler ── */

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

    const plan = PLANS[planKey as PlanKey];
    if (!plan) {
      res.status(400).json({ error: `Invalid planKey. Must be one of: ${Object.keys(PLANS).join(", ")}` });
      return;
    }

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
