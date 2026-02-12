import { getAllPlans, type FlowBlueprint } from "@flow/core";
import type { FlowTemplate, FlowType } from "@flow/core";
import { getAllTemplates, createTemplate } from "./libraryStore.js";

const FLOW_NAME_TO_TYPE: Record<string, FlowType> = {
  "Email Welcome": "email-welcome",
  "SMS Welcome": "sms-welcome",
  "Checkout Abandonment": "checkout-abandonment",
  "Cart Abandonment": "cart-abandonment",
  "Browse Abandonment": "browse-abandonment",
  "Site Abandonment": "site-abandonment",
  "Post-Purchase": "post-purchase",
  "Winback": "winback",
  "Sunset": "sunset",
};

function blueprintToTemplate(blueprint: FlowBlueprint, planName: string): FlowTemplate {
  const flowType = FLOW_NAME_TO_TYPE[blueprint.name] ?? "custom";
  const totalMessages = blueprint.emailCount + blueprint.smsCount;
  const splitDesc = blueprint.hasSplit ? `, with split` : "";
  const now = new Date().toISOString();

  return {
    id: blueprint.flowId,
    flowType,
    name: `${blueprint.name} — ${planName}`,
    description: `${totalMessages} messages${splitDesc} (${blueprint.emailCount}E/${blueprint.smsCount}S)`,
    triggerEvent: blueprint.triggerEvent,
    emailCount: blueprint.emailCount,
    smsCount: blueprint.smsCount,
    hasSplit: blueprint.hasSplit,
    splitCondition: blueprint.splitCondition,
    splitSegments: blueprint.splitSegments,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function seedLibraryIfEmpty(): Promise<number> {
  const existing = await getAllTemplates();
  const hasAny = Object.values(existing).some((arr) => arr.length > 0);
  if (hasAny) return 0;

  const plans = getAllPlans();
  let count = 0;

  for (const plan of plans) {
    for (const blueprint of plan.flows) {
      if (blueprint.mirrorsFlow) continue;
      try {
        await createTemplate(blueprintToTemplate(blueprint, plan.name));
        count++;
      } catch (err) {
        console.warn(`Seed skipped ${blueprint.flowId}:`, err);
      }
    }
  }

  console.log(`Seeded library with ${count} default templates.`);
  return count;
}
