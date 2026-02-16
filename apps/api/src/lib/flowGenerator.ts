import type { FlowBlueprint, PlanDefinition } from "@flow/core";
import { getOpenAI } from "./openai.js";
import type { BrandProfile } from "./brandAnalyzer.js";

/* ── AI-generated content per flow ── */

type StepContent = {
  title: string;
  channel: "email" | "sms";
  copyHint: string;
  subjectLine?: string;
  discountCode?: { included: boolean; code?: string; description?: string };
  abTest?: { description: string };
  messagingFocus?: string;
  smartSending?: boolean;
  utmLinks?: boolean;
  filterConditions?: string;
  implementationNotes?: string;
  strategy?: { primaryFocus: string; secondaryFocus: string };
};

type NoteContent = {
  title: string;
  body: string;
  attachToStep: number;
};

type StrategyContent = {
  primaryFocus: string;
  secondaryFocus: string;
};

type GeneratedFlowContent = {
  flowName: string;
  triggerDescription: string;
  splitConditionTailored?: string;
  /** Steps for the "yes" branch (or main branch if no split) */
  yesSteps: StepContent[];
  /** Steps for the "no" branch (only when split exists) */
  noSteps: StepContent[];
  /** Objective/focus notes to attach beside steps */
  notes: NoteContent[];
  /** Wait durations between steps */
  waitDurations: Array<{ value: number; unit: "hours" | "days" }>;
  /** Strategy for the yes/main branch */
  yesStrategy?: StrategyContent;
  /** Strategy for the no branch */
  noStrategy?: StrategyContent;
};

/* ── FlowSpec-compatible output types ── */

type FlowNode =
  | { id: string; type: "trigger"; title: string; event: string }
  | { id: string; type: "profileFilter"; title: string; filters: string[] }
  | { id: string; type: "split"; title: string; condition: string; labels: { yes: string; no: string } }
  | { id: string; type: "wait"; duration: { value: number; unit: "minutes" | "hours" | "days" } }
  | { id: string; type: "message"; channel: "email" | "sms"; title: string; copyHint?: string; discountCode?: { included: boolean; code?: string; description?: string }; abTest?: { description: string }; messagingFocus?: string; smartSending?: boolean; utmLinks?: boolean; filterConditions?: string; implementationNotes?: string; strategy?: { primaryFocus: string; secondaryFocus: string } }
  | { id: string; type: "outcome"; title: string; result: string }
  | { id: string; type: "note"; title: string; body: string }
  | { id: string; type: "strategy"; title: string; primaryFocus: string; secondaryFocus: string; branchLabel?: "yes" | "no" };

type FlowEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

type FlowSpecOutput = {
  id: string;
  name: string;
  source: { mode: "manual" };
  channels: Array<"email" | "sms">;
  defaults: { delay: { value: number; unit: "days" } };
  nodes: FlowNode[];
  edges: FlowEdge[];
};

/* ── prompt builder ── */

function buildPrompt(blueprint: FlowBlueprint, brand: BrandProfile): string {
  const totalSteps = blueprint.emailCount + blueprint.smsCount;

  let structureDesc: string;
  if (blueprint.hasSplit && blueprint.splitSegments) {
    const yes = blueprint.splitSegments.yes;
    const no = blueprint.splitSegments.no;
    structureDesc = `This flow has a conditional split.
Yes branch: ${yes.email} emails, ${yes.sms} SMS.
No branch: ${no.email} emails, ${no.sms} SMS.
Split condition template: "${blueprint.splitCondition}"`;
  } else {
    structureDesc = `This is a linear flow (no split) with ${blueprint.emailCount} emails and ${blueprint.smsCount} SMS.`;
  }

  const extraProfileLines: string[] = [];
  if (brand.priceRange && brand.priceRange !== "unknown") extraProfileLines.push(`- Price range: ${brand.priceRange}`);
  if (brand.averageOrderValue && brand.averageOrderValue !== "unknown") extraProfileLines.push(`- Average order value: ${brand.averageOrderValue}`);
  if (brand.businessStage && brand.businessStage !== "unknown") extraProfileLines.push(`- Business stage: ${brand.businessStage}`);
  if (brand.emailListSize && brand.emailListSize !== "unknown") extraProfileLines.push(`- Email list size: ${brand.emailListSize}`);
  if (brand.discountApproach && brand.discountApproach !== "unknown") extraProfileLines.push(`- Discount approach: ${brand.discountApproach}`);
  if (brand.keyDifferentiators?.length) extraProfileLines.push(`- Key differentiators: ${brand.keyDifferentiators.join(", ")}`);
  if (brand.brandTone && brand.brandTone !== "friendly and professional") extraProfileLines.push(`- Brand tone: ${brand.brandTone}`);
  if (brand.competitors && brand.competitors !== "unknown") extraProfileLines.push(`- Competitors: ${brand.competitors}`);
  if (brand.specialInstructions) extraProfileLines.push(`- Special instructions: ${brand.specialInstructions}`);

  return `You are a senior email/SMS marketing strategist at ZHS Ecom, an agency specializing in Klaviyo retention flows for ecommerce brands.

Generate tailored content for a "${blueprint.name}" flow for this brand:

BRAND PROFILE:
- Brand: ${brand.brandName}
- Industry: ${brand.industry}
- Target audience: ${brand.targetAudience}
- Brand voice: ${brand.brandVoice}
- Key products: ${brand.keyProducts.join(", ")}
- USPs: ${brand.uniqueSellingPoints.join(", ")}
- Discount strategy: ${brand.discountStrategy}
- Summary: ${brand.summary}
${extraProfileLines.length > 0 ? extraProfileLines.join("\n") : ""}

FLOW STRUCTURE:
- Flow type: ${blueprint.name}
- Trigger: ${blueprint.triggerEvent}
- Total messages: ${totalSteps} (${blueprint.emailCount} emails, ${blueprint.smsCount} SMS)
${structureDesc}
${blueprint.structureNote ? `Note: ${blueprint.structureNote}` : ""}

INSTRUCTIONS:
1. For each message step, provide a title, channel (email/sms), a copy hint (1-2 sentences describing what the message should say), and a subject line suggestion for emails.
2. For each message step, also provide:
   - "discountCode": { "included": true/false, "description": "short generic note like 'Include a discount code to drive urgency'" (if included) }. Decide strategically which steps should offer discounts — typically later in the flow to create urgency, not in the first touch. Do NOT invent actual discount codes — just indicate whether this step should include one and describe the purpose.
   - "abTest": { "description": "what is being A/B tested" } — only include this for steps where A/B testing adds strategic value (e.g., testing subject lines, formats, approaches). Not every step needs one.
   - "messagingFocus": a short label describing the messaging strategy of that step (e.g., "Cart Reminders, Familiarity & Trust", "Social Proof + First-Time Discount", "Final Urgency, Stock & Scarcity").
   - "smartSending": boolean — recommend false (OFF) for most messages, true (ON) for re-engagement or high-frequency sends.
   - "utmLinks": boolean — recommend true (YES) for all marketing messages.
   - "filterConditions": string describing any profile filters for this step (e.g., "Exclude VIP customers", "Only send to engaged subscribers"). Use "NA" if none.
   - "implementationNotes": string with brief implementation hints or special notes for the strategist (e.g., "Use dynamic product block", "Include loyalty points balance").
   - "strategy": { "primaryFocus": "1-2 sentences about this step's main goal", "secondaryFocus": "1-2 sentences about the supporting approach" }. EVERY message step (both email AND SMS) MUST have a unique strategy explaining its purpose in the flow.
3. Tailor all content to the brand's voice, products, and audience.
4. If there's a split, tailor the split condition to the brand (e.g., replace generic "purchase history" with something specific).
5. Always return "notes" as an empty array []. Objective/focus information should be captured in the "implementationNotes" field of each step instead.
6. Suggest wait durations between steps (in hours or days). Provide ${Math.max(totalSteps - 1, 1)} wait durations.
7. Each step's strategy should be tailored to that step's role in the flow. For the first step in each branch the strategy should set the overall branch direction. For subsequent steps, it should explain how the step builds on the previous ones.
8. If the brand profile includes price range, AOV, discount approach, or competitors — use that context to shape the messaging strategy. For example, a premium brand that "never discounts" should focus on value and exclusivity, while one with "regular discounts" can lead with offers. Tailor tone and urgency to the brand tone (e.g., "luxury & refined" vs "bold & energetic").
9. If special instructions are provided, follow them exactly (e.g., specific discount codes, topics to avoid, promotions to mention).

Return ONLY valid JSON matching this exact schema:
{
  "flowName": "string",
  "triggerDescription": "string (tailored trigger description)",
  "splitConditionTailored": "string or null",
  "yesSteps": [{ "title": "string", "channel": "email|sms", "copyHint": "string", "subjectLine": "string|undefined", "discountCode": { "included": false }, "abTest": { "description": "string" } | null, "messagingFocus": "string", "smartSending": false, "utmLinks": true, "filterConditions": "NA", "implementationNotes": "string", "strategy": { "primaryFocus": "string", "secondaryFocus": "string" } }],
  "noSteps": [{ "title": "string", "channel": "email|sms", "copyHint": "string", "subjectLine": "string|undefined", "discountCode": { "included": true, "description": "Include a discount to drive urgency" }, "abTest": null, "messagingFocus": "string", "smartSending": false, "utmLinks": true, "filterConditions": "NA", "implementationNotes": "string", "strategy": { "primaryFocus": "string", "secondaryFocus": "string" } }],
  "notes": [],
  "waitDurations": [{ "value": number, "unit": "hours|days" }],
  "yesStrategy": { "primaryFocus": "string", "secondaryFocus": "string" },
  "noStrategy": { "primaryFocus": "string", "secondaryFocus": "string" }
}

${blueprint.hasSplit
    ? "yesSteps should have the steps for the Yes/purchaser branch. noSteps for the No/non-purchaser branch. yesStrategy/noStrategy are legacy fields — set them to match the first step's strategy in each branch."
    : "Put all steps in yesSteps. Leave noSteps as an empty array. Set yesStrategy to match the first step's strategy. Set noStrategy to null."}`;
}

/* ── FlowSpec assembler ── */

function assembleFlowSpec(
  blueprint: FlowBlueprint,
  content: GeneratedFlowContent
): FlowSpecOutput {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let edgeCounter = 0;

  const nextEdgeId = () => `${blueprint.flowId}_edge_${++edgeCounter}`;

  const channels = new Set<"email" | "sms">();
  const allSteps = [...content.yesSteps, ...content.noSteps];
  for (const step of allSteps) {
    channels.add(step.channel);
  }

  // 1. Trigger
  const triggerId = `${blueprint.flowId}_trigger`;
  nodes.push({
    id: triggerId,
    type: "trigger",
    title: "Trigger",
    event: content.triggerDescription
  });

  if (!blueprint.hasSplit || !blueprint.splitSegments) {
    // Linear flow: trigger → wait → step → wait → step → ... → outcome
    let prevId = triggerId;
    const steps = content.yesSteps;
    const waits = content.waitDurations;

    for (let i = 0; i < steps.length; i++) {
      // Add wait before each message (except first which comes right after trigger)
      if (i > 0 && waits[i - 1]) {
        const waitId = `${blueprint.flowId}_wait_${i}`;
        nodes.push({
          id: waitId,
          type: "wait",
          duration: { value: waits[i - 1].value, unit: waits[i - 1].unit }
        });
        edges.push({ id: nextEdgeId(), from: prevId, to: waitId });
        prevId = waitId;
      }

      const stepId = `${blueprint.flowId}_step_${i + 1}`;
      const msgNode: FlowNode = {
        id: stepId,
        type: "message",
        channel: steps[i].channel,
        title: steps[i].title,
        copyHint: steps[i].copyHint,
        ...(steps[i].discountCode ? { discountCode: steps[i].discountCode } : {}),
        ...(steps[i].abTest ? { abTest: steps[i].abTest } : {}),
        ...(steps[i].messagingFocus ? { messagingFocus: steps[i].messagingFocus } : {}),
        ...(steps[i].smartSending != null ? { smartSending: steps[i].smartSending } : {}),
        ...(steps[i].utmLinks != null ? { utmLinks: steps[i].utmLinks } : {}),
        ...(steps[i].filterConditions ? { filterConditions: steps[i].filterConditions } : {}),
        ...(steps[i].implementationNotes ? { implementationNotes: steps[i].implementationNotes } : {}),
        ...(steps[i].strategy
          ? { strategy: steps[i].strategy }
          : i === 0 && content.yesStrategy ? { strategy: content.yesStrategy } : {})
      };
      nodes.push(msgNode);
      edges.push({ id: nextEdgeId(), from: prevId, to: stepId });
      prevId = stepId;
    }

    // Outcome
    const outcomeId = `${blueprint.flowId}_outcome`;
    nodes.push({ id: outcomeId, type: "outcome", title: "Completed", result: "Flow completed" });
    edges.push({ id: nextEdgeId(), from: prevId, to: outcomeId });

  } else {
    // Split flow: trigger → split → (yes branch) → outcome / (no branch) → outcome
    const splitId = `${blueprint.flowId}_split`;
    nodes.push({
      id: splitId,
      type: "split",
      title: "Conditional Split",
      condition: content.splitConditionTailored || blueprint.splitCondition || "Condition",
      labels: { yes: "Yes", no: "No" }
    });
    edges.push({ id: nextEdgeId(), from: triggerId, to: splitId });

    // Yes branch
    let prevYes = splitId;
    for (let i = 0; i < content.yesSteps.length; i++) {
      if (i > 0 && content.waitDurations[i - 1]) {
        const waitId = `${blueprint.flowId}_yes_wait_${i}`;
        nodes.push({
          id: waitId,
          type: "wait",
          duration: { value: content.waitDurations[i - 1].value, unit: content.waitDurations[i - 1].unit }
        });
        edges.push({ id: nextEdgeId(), from: prevYes, to: waitId });
        prevYes = waitId;
      }
      const stepId = `${blueprint.flowId}_yes_${i + 1}`;
      const step = content.yesSteps[i];
      const yesMsg: FlowNode = {
        id: stepId,
        type: "message",
        channel: step.channel,
        title: step.title,
        copyHint: step.copyHint,
        ...(step.discountCode ? { discountCode: step.discountCode } : {}),
        ...(step.abTest ? { abTest: step.abTest } : {}),
        ...(step.messagingFocus ? { messagingFocus: step.messagingFocus } : {}),
        ...(step.smartSending != null ? { smartSending: step.smartSending } : {}),
        ...(step.utmLinks != null ? { utmLinks: step.utmLinks } : {}),
        ...(step.filterConditions ? { filterConditions: step.filterConditions } : {}),
        ...(step.implementationNotes ? { implementationNotes: step.implementationNotes } : {}),
        ...(step.strategy
          ? { strategy: step.strategy }
          : i === 0 && content.yesStrategy ? { strategy: content.yesStrategy } : {})
      };
      nodes.push(yesMsg);
      edges.push({
        id: nextEdgeId(),
        from: prevYes,
        to: stepId,
        ...(prevYes === splitId ? { label: "Yes" } : {})
      });
      prevYes = stepId;
    }
    const yesOutcome = `${blueprint.flowId}_yes_outcome`;
    nodes.push({ id: yesOutcome, type: "outcome", title: "Yes Path Complete", result: "Purchaser path completed" });
    edges.push({ id: nextEdgeId(), from: prevYes, to: yesOutcome });

    // No branch
    let prevNo = splitId;
    for (let i = 0; i < content.noSteps.length; i++) {
      if (i > 0 && content.waitDurations[i - 1]) {
        const waitId = `${blueprint.flowId}_no_wait_${i}`;
        nodes.push({
          id: waitId,
          type: "wait",
          duration: { value: content.waitDurations[i - 1].value, unit: content.waitDurations[i - 1].unit }
        });
        edges.push({ id: nextEdgeId(), from: prevNo, to: waitId });
        prevNo = waitId;
      }
      const stepId = `${blueprint.flowId}_no_${i + 1}`;
      const noStep = content.noSteps[i];
      const noMsg: FlowNode = {
        id: stepId,
        type: "message",
        channel: noStep.channel,
        title: noStep.title,
        copyHint: noStep.copyHint,
        ...(noStep.discountCode ? { discountCode: noStep.discountCode } : {}),
        ...(noStep.abTest ? { abTest: noStep.abTest } : {}),
        ...(noStep.messagingFocus ? { messagingFocus: noStep.messagingFocus } : {}),
        ...(noStep.smartSending != null ? { smartSending: noStep.smartSending } : {}),
        ...(noStep.utmLinks != null ? { utmLinks: noStep.utmLinks } : {}),
        ...(noStep.filterConditions ? { filterConditions: noStep.filterConditions } : {}),
        ...(noStep.implementationNotes ? { implementationNotes: noStep.implementationNotes } : {}),
        ...(noStep.strategy
          ? { strategy: noStep.strategy }
          : i === 0 && content.noStrategy ? { strategy: content.noStrategy } : {})
      };
      nodes.push(noMsg);
      edges.push({
        id: nextEdgeId(),
        from: prevNo,
        to: stepId,
        ...(prevNo === splitId ? { label: "No" } : {})
      });
      prevNo = stepId;
    }
    const noOutcome = `${blueprint.flowId}_no_outcome`;
    nodes.push({ id: noOutcome, type: "outcome", title: "No Path Complete", result: "Non-purchaser path completed" });
    edges.push({ id: nextEdgeId(), from: prevNo, to: noOutcome });
  }

  return {
    id: blueprint.flowId,
    name: `${content.flowName}`,
    source: { mode: "manual" },
    channels: [...channels].length > 0 ? [...channels] : ["email"],
    defaults: { delay: { value: 2, unit: "days" } },
    nodes,
    edges
  };
}

/* ── main generation function ── */

export async function generateFlowsForPlan(
  plan: PlanDefinition,
  brand: BrandProfile
): Promise<FlowSpecOutput[]> {
  const openai = getOpenAI();
  const results: FlowSpecOutput[] = [];

  // Track generated flows for mirroring
  const generatedContent = new Map<string, GeneratedFlowContent>();

  for (const blueprint of plan.flows) {
    let content: GeneratedFlowContent;

    // If this flow mirrors another, reuse its content with adjusted trigger
    if (blueprint.mirrorsFlow && generatedContent.has(blueprint.mirrorsFlow)) {
      const source = generatedContent.get(blueprint.mirrorsFlow)!;
      content = {
        ...source,
        flowName: blueprint.name,
        triggerDescription: blueprint.triggerEvent
      };
    } else {
      // Call OpenAI for tailored content
      const prompt = buildPrompt(blueprint, brand);
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a senior retention marketing strategist. Return only valid JSON." },
          { role: "user", content: prompt }
        ]
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      try {
        content = JSON.parse(raw) as GeneratedFlowContent;
      } catch {
        console.error(`Failed to parse AI response for ${blueprint.flowId}:`, raw);
        // Fallback: generate minimal content
        content = buildFallbackContent(blueprint, brand);
      }

      // Validate step counts match blueprint
      content = validateAndFixCounts(content, blueprint);
    }

    generatedContent.set(blueprint.flowId, content);
    const spec = assembleFlowSpec(blueprint, content);
    results.push(spec);
  }

  return results;
}

/* ── fallback if AI fails ── */

function buildFallbackContent(
  blueprint: FlowBlueprint,
  brand: BrandProfile
): GeneratedFlowContent {
  const yesSteps: StepContent[] = [];
  const noSteps: StepContent[] = [];

  if (blueprint.hasSplit && blueprint.splitSegments) {
    const yes = blueprint.splitSegments.yes;
    for (let i = 0; i < yes.email; i++) {
      yesSteps.push({ title: `Email ${i + 1} (Yes)`, channel: "email", copyHint: `Email for ${brand.brandName} yes-branch customers`, discountCode: { included: false }, messagingFocus: "Brand Engagement", smartSending: false, utmLinks: true, filterConditions: "NA", implementationNotes: "Standard email template" });
    }
    for (let i = 0; i < yes.sms; i++) {
      yesSteps.push({ title: `SMS ${i + 1} (Yes)`, channel: "sms", copyHint: `SMS for ${brand.brandName} yes-branch customers`, discountCode: { included: false }, messagingFocus: "Quick Reminder", smartSending: false, utmLinks: true, filterConditions: "NA", implementationNotes: "Standard SMS template" });
    }
    const no = blueprint.splitSegments.no;
    for (let i = 0; i < no.email; i++) {
      noSteps.push({ title: `Email ${i + 1} (No)`, channel: "email", copyHint: `Email for ${brand.brandName} no-branch customers`, discountCode: { included: false }, messagingFocus: "Trust Building", smartSending: false, utmLinks: true, filterConditions: "NA", implementationNotes: "Standard email template" });
    }
    for (let i = 0; i < no.sms; i++) {
      noSteps.push({ title: `SMS ${i + 1} (No)`, channel: "sms", copyHint: `SMS for ${brand.brandName} no-branch customers`, discountCode: { included: false }, messagingFocus: "Quick Reminder", smartSending: false, utmLinks: true, filterConditions: "NA", implementationNotes: "Standard SMS template" });
    }
  } else {
    for (let i = 0; i < blueprint.emailCount; i++) {
      yesSteps.push({ title: `Email ${i + 1}`, channel: "email", copyHint: `Email for ${brand.brandName}`, discountCode: { included: false }, messagingFocus: "Brand Engagement", smartSending: false, utmLinks: true, filterConditions: "NA", implementationNotes: "Standard email template" });
    }
    for (let i = 0; i < blueprint.smsCount; i++) {
      yesSteps.push({ title: `SMS ${i + 1}`, channel: "sms", copyHint: `SMS for ${brand.brandName}`, discountCode: { included: false }, messagingFocus: "Quick Reminder", smartSending: false, utmLinks: true, filterConditions: "NA", implementationNotes: "Standard SMS template" });
    }
  }

  const totalSteps = yesSteps.length + noSteps.length;
  const waits = Array.from({ length: Math.max(totalSteps - 1, 1) }, (_, i) => ({
    value: i === 0 ? 4 : 1,
    unit: (i === 0 ? "hours" : "days") as "hours" | "days"
  }));

  const yesStrategy: StrategyContent = {
    primaryFocus: `Engage ${brand.brandName} customers through the ${blueprint.name} flow.`,
    secondaryFocus: `Reinforce brand value and drive conversions using ${brand.keyProducts.slice(0, 2).join(" and ")}.`
  };

  return {
    flowName: blueprint.name,
    triggerDescription: blueprint.triggerEvent,
    splitConditionTailored: blueprint.splitCondition,
    yesSteps,
    noSteps,
    notes: [],
    waitDurations: waits,
    yesStrategy,
    noStrategy: blueprint.hasSplit ? {
      primaryFocus: `Convert first-time ${brand.brandName} visitors into customers.`,
      secondaryFocus: `Build trust and brand awareness for new subscribers.`
    } : undefined
  };
}

/* ── fix step counts if AI returns wrong number ── */

function validateAndFixCounts(
  content: GeneratedFlowContent,
  blueprint: FlowBlueprint
): GeneratedFlowContent {
  if (blueprint.hasSplit && blueprint.splitSegments) {
    const yesTarget = blueprint.splitSegments.yes.email + blueprint.splitSegments.yes.sms;
    const noTarget = blueprint.splitSegments.no.email + blueprint.splitSegments.no.sms;

    while (content.yesSteps.length < yesTarget) {
      content.yesSteps.push({ title: `Step ${content.yesSteps.length + 1} (Yes)`, channel: "email", copyHint: "Additional step" });
    }
    content.yesSteps = content.yesSteps.slice(0, yesTarget);

    while (content.noSteps.length < noTarget) {
      content.noSteps.push({ title: `Step ${content.noSteps.length + 1} (No)`, channel: "email", copyHint: "Additional step" });
    }
    content.noSteps = content.noSteps.slice(0, noTarget);
  } else {
    const target = blueprint.emailCount + blueprint.smsCount;
    while (content.yesSteps.length < target) {
      content.yesSteps.push({ title: `Step ${content.yesSteps.length + 1}`, channel: "email", copyHint: "Additional step" });
    }
    content.yesSteps = content.yesSteps.slice(0, target);
    content.noSteps = [];
  }

  if (!content.waitDurations || content.waitDurations.length === 0) {
    content.waitDurations = [{ value: 2, unit: "days" }];
  }

  if (!content.notes) {
    content.notes = [];
  }

  if (!content.yesStrategy) {
    content.yesStrategy = {
      primaryFocus: `Drive engagement through the ${content.flowName} flow.`,
      secondaryFocus: "Reinforce brand value and move subscribers toward conversion."
    };
  }

  if (blueprint.hasSplit && !content.noStrategy) {
    content.noStrategy = {
      primaryFocus: "Convert new visitors into first-time customers.",
      secondaryFocus: "Build trust and establish brand credibility."
    };
  }

  return content;
}
