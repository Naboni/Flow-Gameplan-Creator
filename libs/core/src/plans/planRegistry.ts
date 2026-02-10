/**
 * Plan Registry
 *
 * Exact flow structures from zhs-ecom.com/pricing for each plan tier.
 * Each plan defines the flows to generate, with email/SMS counts,
 * split conditions, and mirror relationships.
 */

export type PlanKey = "core-foundation" | "growth-engine" | "full-system";

export type FlowBlueprint = {
  /** Unique flow identifier within the plan */
  flowId: string;
  /** Display name */
  name: string;
  /** Trigger event description */
  triggerEvent: string;
  /** Number of emails in this flow */
  emailCount: number;
  /** Number of SMS in this flow */
  smsCount: number;
  /** Whether this flow has a conditional split */
  hasSplit: boolean;
  /** Split condition (if hasSplit is true) */
  splitCondition?: string;
  /** Per-segment counts when split is present */
  splitSegments?: {
    yes: { email: number; sms: number };
    no: { email: number; sms: number };
  };
  /** If this flow mirrors another flow's structure */
  mirrorsFlow?: string;
  /** Notes about brand-dependent structure */
  structureNote?: string;
};

export type PlanDefinition = {
  key: PlanKey;
  name: string;
  price: string;
  tagline: string;
  buildTime: string;
  flows: FlowBlueprint[];
};

/* ─────────────────────────────────────────────
   Core Foundation – $3,200
   For brands under $1M/year
   ───────────────────────────────────────────── */
const coreFoundation: PlanDefinition = {
  key: "core-foundation",
  name: "Core Foundation",
  price: "$3,200",
  tagline: "For brands under $1M/year",
  buildTime: "1-month build",
  flows: [
    {
      flowId: "core_email_welcome",
      name: "Email Welcome",
      triggerEvent: "When someone subscribes to the email list",
      emailCount: 3,
      smsCount: 0,
      hasSplit: false
    },
    {
      flowId: "core_sms_welcome",
      name: "SMS Welcome",
      triggerEvent: "When someone opts in to SMS",
      emailCount: 0,
      smsCount: 2,
      hasSplit: false
    },
    {
      flowId: "core_checkout_abandonment",
      name: "Checkout Abandonment",
      triggerEvent: "When someone starts checkout but does not purchase",
      emailCount: 2,
      smsCount: 2,
      hasSplit: false
    },
    {
      flowId: "core_cart_abandonment",
      name: "Cart Abandonment",
      triggerEvent: "When someone adds to cart but does not purchase",
      emailCount: 2,
      smsCount: 2,
      hasSplit: false,
      mirrorsFlow: "core_checkout_abandonment"
    },
    {
      flowId: "core_browse_abandonment",
      name: "Browse Abandonment",
      triggerEvent: "When someone views products but does not add to cart",
      emailCount: 2,
      smsCount: 2,
      hasSplit: false
    },
    {
      flowId: "core_post_purchase",
      name: "Post-Purchase",
      triggerEvent: "When someone completes a purchase",
      emailCount: 1,
      smsCount: 1,
      hasSplit: false
    }
  ]
};

/* ─────────────────────────────────────────────
   Growth Engine – $7,360
   For brands scaling to $1-2M/year
   ───────────────────────────────────────────── */
const growthEngine: PlanDefinition = {
  key: "growth-engine",
  name: "Growth Engine",
  price: "$7,360",
  tagline: "For brands scaling to $1-2M/year",
  buildTime: "1-2 month build",
  flows: [
    {
      flowId: "growth_email_welcome",
      name: "Email Welcome",
      triggerEvent: "When someone subscribes to the email list",
      emailCount: 4,
      smsCount: 0,
      hasSplit: true,
      splitCondition: "Has placed order (purchaser vs non-purchaser)",
      splitSegments: {
        yes: { email: 1, sms: 0 },
        no: { email: 3, sms: 0 }
      }
    },
    {
      flowId: "growth_sms_welcome",
      name: "SMS Welcome",
      triggerEvent: "When someone opts in to SMS",
      emailCount: 0,
      smsCount: 3,
      hasSplit: true,
      splitCondition: "Has placed order (purchaser vs non-purchaser)",
      splitSegments: {
        yes: { email: 0, sms: 1 },
        no: { email: 0, sms: 2 }
      }
    },
    {
      flowId: "growth_checkout_abandonment",
      name: "Checkout Abandonment",
      triggerEvent: "When someone starts checkout but does not purchase",
      emailCount: 6,
      smsCount: 4,
      hasSplit: true,
      splitCondition: "Purchase history (has purchased before vs first-time)",
      splitSegments: {
        yes: { email: 3, sms: 2 },
        no: { email: 3, sms: 2 }
      }
    },
    {
      flowId: "growth_cart_abandonment",
      name: "Cart Abandonment",
      triggerEvent: "When someone adds to cart but does not purchase",
      emailCount: 6,
      smsCount: 4,
      hasSplit: true,
      splitCondition: "Purchase history (has purchased before vs first-time)",
      splitSegments: {
        yes: { email: 3, sms: 2 },
        no: { email: 3, sms: 2 }
      },
      mirrorsFlow: "growth_checkout_abandonment"
    },
    {
      flowId: "growth_browse_abandonment",
      name: "Browse Abandonment",
      triggerEvent: "When someone views products but does not add to cart",
      emailCount: 6,
      smsCount: 4,
      hasSplit: true,
      splitCondition: "Purchase history (has purchased before vs first-time)",
      splitSegments: {
        yes: { email: 3, sms: 2 },
        no: { email: 3, sms: 2 }
      }
    },
    {
      flowId: "growth_site_abandonment",
      name: "Site Abandonment",
      triggerEvent: "When someone visits the site but does not view products",
      emailCount: 2,
      smsCount: 0,
      hasSplit: false
    },
    {
      flowId: "growth_post_purchase",
      name: "Post-Purchase",
      triggerEvent: "When someone completes a purchase",
      emailCount: 3,
      smsCount: 2,
      hasSplit: true,
      splitCondition: "Product or purchase history",
      structureNote: "Structure is brand-dependent, typically split by product or purchase history"
    },
    {
      flowId: "growth_winback",
      name: "Winback",
      triggerEvent: "When someone has not purchased in 60+ days",
      emailCount: 2,
      smsCount: 0,
      hasSplit: false
    }
  ]
};

/* ─────────────────────────────────────────────
   Full System – $12,800
   For brands scaling to $2-20M/year and beyond
   ───────────────────────────────────────────── */
const fullSystem: PlanDefinition = {
  key: "full-system",
  name: "Full System",
  price: "$12,800",
  tagline: "For brands scaling to $2-20M/year and beyond",
  buildTime: "1-2 month build",
  flows: [
    {
      flowId: "full_email_welcome",
      name: "Email Welcome",
      triggerEvent: "When someone subscribes to the email list",
      emailCount: 6,
      smsCount: 0,
      hasSplit: true,
      splitCondition: "Has placed order (purchaser vs non-purchaser)",
      splitSegments: {
        yes: { email: 2, sms: 0 },
        no: { email: 4, sms: 0 }
      }
    },
    {
      flowId: "full_sms_welcome",
      name: "SMS Welcome",
      triggerEvent: "When someone opts in to SMS",
      emailCount: 0,
      smsCount: 4,
      hasSplit: true,
      splitCondition: "Has placed order (purchaser vs non-purchaser)",
      splitSegments: {
        yes: { email: 0, sms: 1 },
        no: { email: 0, sms: 3 }
      }
    },
    {
      flowId: "full_checkout_abandonment",
      name: "Checkout Abandonment",
      triggerEvent: "When someone starts checkout but does not purchase",
      emailCount: 8,
      smsCount: 4,
      hasSplit: true,
      splitCondition: "Purchase history (has purchased before vs first-time)",
      splitSegments: {
        yes: { email: 4, sms: 2 },
        no: { email: 4, sms: 2 }
      }
    },
    {
      flowId: "full_cart_abandonment",
      name: "Cart Abandonment",
      triggerEvent: "When someone adds to cart but does not purchase",
      emailCount: 8,
      smsCount: 4,
      hasSplit: true,
      splitCondition: "Purchase history (has purchased before vs first-time)",
      splitSegments: {
        yes: { email: 4, sms: 2 },
        no: { email: 4, sms: 2 }
      },
      mirrorsFlow: "full_checkout_abandonment"
    },
    {
      flowId: "full_browse_abandonment",
      name: "Browse Abandonment",
      triggerEvent: "When someone views products but does not add to cart",
      emailCount: 8,
      smsCount: 4,
      hasSplit: true,
      splitCondition: "Purchase history (has purchased before vs first-time)",
      splitSegments: {
        yes: { email: 4, sms: 2 },
        no: { email: 4, sms: 2 }
      }
    },
    {
      flowId: "full_site_abandonment",
      name: "Site Abandonment",
      triggerEvent: "When someone visits the site but does not view products",
      emailCount: 3,
      smsCount: 0,
      hasSplit: false
    },
    {
      flowId: "full_post_purchase",
      name: "Post-Purchase",
      triggerEvent: "When someone completes a purchase",
      emailCount: 6,
      smsCount: 3,
      hasSplit: true,
      splitCondition: "Product or purchase history",
      structureNote: "Structure is brand-dependent, typically split by product or purchase history"
    },
    {
      flowId: "full_winback",
      name: "Winback",
      triggerEvent: "When someone has not purchased in 60+ days",
      emailCount: 6,
      smsCount: 0,
      hasSplit: true,
      splitCondition: "Purchase history (has purchased before vs first-time)",
      splitSegments: {
        yes: { email: 3, sms: 0 },
        no: { email: 3, sms: 0 }
      }
    },
    {
      flowId: "full_sunset",
      name: "Sunset",
      triggerEvent: "When someone has not engaged in 90+ days",
      emailCount: 3,
      smsCount: 0,
      hasSplit: false
    }
  ]
};

/* ── registry lookup ── */

const PLAN_REGISTRY: Record<PlanKey, PlanDefinition> = {
  "core-foundation": coreFoundation,
  "growth-engine": growthEngine,
  "full-system": fullSystem
};

export function getPlanDefinition(key: PlanKey): PlanDefinition {
  const plan = PLAN_REGISTRY[key];
  if (!plan) {
    throw new Error(`Unknown plan key: ${key}`);
  }
  return plan;
}

export function getAllPlanKeys(): PlanKey[] {
  return Object.keys(PLAN_REGISTRY) as PlanKey[];
}

export function getAllPlans(): PlanDefinition[] {
  return Object.values(PLAN_REGISTRY);
}
