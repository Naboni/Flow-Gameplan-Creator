import type { FlowBlueprint, PlanDefinition, PlanKey } from "@flow/core";
import { getOpenAI } from "./openai.js";

type ParsedBlueprint = {
  name: string;
  triggerEvent: string;
  emailCount: number;
  smsCount: number;
  hasSplit: boolean;
  splitCondition?: string;
  splitSegments?: {
    yes: { email: number; sms: number };
    no: { email: number; sms: number };
  };
  mirrorsFlow?: string;
  structureNote?: string;
  skipGeneration?: boolean;
};

const PARSE_PROMPT = `You are a parser that converts free-text flow specifications into structured JSON.

The input contains numbered items (e.g., "1)", "2.", "3)"). Each numbered item describes a SEPARATE flow chart. Extract an array of flow blueprints. A single flow item may span multiple lines — the next flow starts at the next number.

For each flow, extract:
- "name": flow name (e.g., "Email Welcome", "Checkout Abandonment")
- "triggerEvent": the Klaviyo trigger event (infer from the flow type, e.g., "When someone subscribes to the email list" for Email Welcome, "When someone starts checkout but does not purchase" for Checkout Abandonment)
- "emailCount": total number of emails across all branches
- "smsCount": total number of SMS across all branches
- "hasSplit": true if a conditional split is described
- "splitCondition": the split condition (e.g., "Has placed order (purchaser vs non-purchaser)")
- "splitSegments": if split, the per-segment counts: { "yes": { "email": N, "sms": N }, "no": { "email": N, "sms": N } }
- "mirrorsFlow": if a flow says "mirrors X" or "structure mirrors X", set this to the name of the flow it mirrors
- "structureNote": any extra notes about structure (e.g., "brand-dependent")
- "skipGeneration": true ONLY for items that are NOT flow charts (e.g., "Site pop-ups", capture mechanisms, tools) — these are informational items, not email/SMS flows

IMPORTANT RULES:
1. For split flows: emailCount and smsCount are the TOTALS (sum of both segments). splitSegments has the per-branch breakdown.
2. For "X for purchasers, Y for non-purchasers" format: "yes" = purchasers, "no" = non-purchasers.
3. For "(N emails M SMS per segment)": divide equally unless specified otherwise.
4. If no split is mentioned, set hasSplit: false, omit splitSegments.
5. Trigger events should be standard Klaviyo triggers — infer from the flow name.
6. Items like "Site pop-ups", "capture forms", external tools are NOT flow charts — mark them skipGeneration: true.

Return ONLY valid JSON: { "flows": [...] }`;

function sanitizeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export async function parseFlowText(text: string): Promise<PlanDefinition> {
  const openai = getOpenAI();

  console.log(`[flow-parser] Parsing flow text (${text.length} chars)...`);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PARSE_PROMPT },
      { role: "user", content: text }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { flows: ParsedBlueprint[] };

  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[flow-parser] Failed to parse AI response:", raw);
    throw new Error("Failed to parse flow specifications. Please check the format and try again.");
  }

  if (!parsed.flows || !Array.isArray(parsed.flows) || parsed.flows.length === 0) {
    throw new Error("No flows found in the specification. Please describe at least one flow.");
  }

  const generableFlows = parsed.flows.filter(f => !f.skipGeneration);
  if (generableFlows.length === 0) {
    throw new Error("No generable flows found. The specification only contained non-flow items (e.g., pop-ups, tools).");
  }

  const blueprints: FlowBlueprint[] = [];
  const nameToId = new Map<string, string>();

  for (const flow of generableFlows) {
    const flowId = `custom_${sanitizeId(flow.name)}`;
    nameToId.set(flow.name.toLowerCase(), flowId);

    const emailCount = Math.max(0, flow.emailCount ?? 0);
    const smsCount = Math.max(0, flow.smsCount ?? 0);

    if (emailCount === 0 && smsCount === 0) continue;

    const blueprint: FlowBlueprint = {
      flowId,
      name: flow.name,
      triggerEvent: flow.triggerEvent || `When ${flow.name.toLowerCase()} is triggered`,
      emailCount,
      smsCount,
      hasSplit: flow.hasSplit ?? false,
    };

    if (flow.hasSplit && flow.splitCondition) {
      blueprint.splitCondition = flow.splitCondition;
    }

    if (flow.hasSplit && flow.splitSegments) {
      blueprint.splitSegments = {
        yes: {
          email: Math.max(0, flow.splitSegments.yes?.email ?? 0),
          sms: Math.max(0, flow.splitSegments.yes?.sms ?? 0),
        },
        no: {
          email: Math.max(0, flow.splitSegments.no?.email ?? 0),
          sms: Math.max(0, flow.splitSegments.no?.sms ?? 0),
        },
      };
    } else if (flow.hasSplit && !flow.splitSegments) {
      const halfEmail = Math.ceil(emailCount / 2);
      const halfSms = Math.ceil(smsCount / 2);
      blueprint.splitSegments = {
        yes: { email: halfEmail, sms: halfSms },
        no: { email: emailCount - halfEmail, sms: smsCount - halfSms },
      };
    }

    if (flow.mirrorsFlow) {
      const mirrorId = nameToId.get(flow.mirrorsFlow.toLowerCase());
      if (mirrorId) blueprint.mirrorsFlow = mirrorId;
    }

    if (flow.structureNote) {
      blueprint.structureNote = flow.structureNote;
    }

    blueprints.push(blueprint);
  }

  if (blueprints.length === 0) {
    throw new Error("No valid flows could be extracted from the specification.");
  }

  console.log(`[flow-parser] Extracted ${blueprints.length} flow blueprints:`,
    blueprints.map(b => `${b.name} (${b.emailCount}E/${b.smsCount}S${b.hasSplit ? ", split" : ""})`).join(", ")
  );

  return {
    key: "custom" as PlanKey,
    name: "Custom Plan",
    price: "Custom",
    tagline: "Custom flow specification",
    buildTime: "Varies",
    flows: blueprints,
  };
}
