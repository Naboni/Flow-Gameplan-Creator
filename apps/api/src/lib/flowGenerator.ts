import { getOpenAI } from "./openai.js";
import type { BrandProfile } from "./brandAnalyzer.js";

/* ── types matching libs/core plan registry ── */

type PlanKey = "core-foundation" | "growth-engine" | "full-system";

type FlowBlueprint = {
  flowId: string;
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
};

type PlanDefinition = {
  key: PlanKey;
  name: string;
  flows: FlowBlueprint[];
};

/* ── AI-generated content per flow ── */

type StepContent = {
  title: string;
  channel: "email" | "sms";
  copyHint: string;
  subjectLine?: string;
};

type NoteContent = {
  title: string;
  body: string;
  attachToStep: number;
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
};

/* ── FlowSpec-compatible output types ── */

type FlowNode =
  | { id: string; type: "trigger"; title: string; event: string }
  | { id: string; type: "profileFilter"; title: string; filters: string[] }
  | { id: string; type: "split"; title: string; condition: string; labels: { yes: string; no: string } }
  | { id: string; type: "wait"; duration: { value: number; unit: "minutes" | "hours" | "days" } }
  | { id: string; type: "message"; channel: "email" | "sms"; title: string; copyHint?: string }
  | { id: string; type: "outcome"; title: string; result: string }
  | { id: string; type: "note"; title: string; body: string };

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

FLOW STRUCTURE:
- Flow type: ${blueprint.name}
- Trigger: ${blueprint.triggerEvent}
- Total messages: ${totalSteps} (${blueprint.emailCount} emails, ${blueprint.smsCount} SMS)
${structureDesc}
${blueprint.structureNote ? `Note: ${blueprint.structureNote}` : ""}

INSTRUCTIONS:
1. For each message step, provide a title, channel (email/sms), a copy hint (1-2 sentences describing what the message should say), and a subject line suggestion for emails.
2. Tailor all content to the brand's voice, products, and audience.
3. If there's a split, tailor the split condition to the brand (e.g., replace generic "purchase history" with something specific).
4. Provide 2-4 OBJECTIVE/FOCUS notes that describe the strategic purpose of key steps. Each note should reference which step number it's about (1-indexed).
5. Suggest wait durations between steps (in hours or days). Provide ${Math.max(totalSteps - 1, 1)} wait durations.

Return ONLY valid JSON matching this exact schema:
{
  "flowName": "string",
  "triggerDescription": "string (tailored trigger description)",
  "splitConditionTailored": "string or null",
  "yesSteps": [{ "title": "string", "channel": "email|sms", "copyHint": "string", "subjectLine": "string|undefined" }],
  "noSteps": [{ "title": "string", "channel": "email|sms", "copyHint": "string", "subjectLine": "string|undefined" }],
  "notes": [{ "title": "OBJECTIVE/FOCUS:", "body": "string", "attachToStep": number }],
  "waitDurations": [{ "value": number, "unit": "hours|days" }]
}

${blueprint.hasSplit
    ? "yesSteps should have the steps for the Yes/purchaser branch. noSteps for the No/non-purchaser branch."
    : "Put all steps in yesSteps. Leave noSteps as an empty array."}`;
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
      nodes.push({
        id: stepId,
        type: "message",
        channel: steps[i].channel,
        title: steps[i].title,
        copyHint: steps[i].copyHint
      });
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
      nodes.push({
        id: stepId,
        type: "message",
        channel: content.yesSteps[i].channel,
        title: content.yesSteps[i].title,
        copyHint: content.yesSteps[i].copyHint
      });
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
      nodes.push({
        id: stepId,
        type: "message",
        channel: content.noSteps[i].channel,
        title: content.noSteps[i].title,
        copyHint: content.noSteps[i].copyHint
      });
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

  // Add note nodes (not connected to the flow, just placed for context)
  for (let i = 0; i < content.notes.length; i++) {
    const noteId = `${blueprint.flowId}_note_${i + 1}`;
    nodes.push({
      id: noteId,
      type: "note",
      title: content.notes[i].title,
      body: content.notes[i].body
    });
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
      yesSteps.push({ title: `Email ${i + 1} (Yes)`, channel: "email", copyHint: `Email for ${brand.brandName} yes-branch customers` });
    }
    for (let i = 0; i < yes.sms; i++) {
      yesSteps.push({ title: `SMS ${i + 1} (Yes)`, channel: "sms", copyHint: `SMS for ${brand.brandName} yes-branch customers` });
    }
    const no = blueprint.splitSegments.no;
    for (let i = 0; i < no.email; i++) {
      noSteps.push({ title: `Email ${i + 1} (No)`, channel: "email", copyHint: `Email for ${brand.brandName} no-branch customers` });
    }
    for (let i = 0; i < no.sms; i++) {
      noSteps.push({ title: `SMS ${i + 1} (No)`, channel: "sms", copyHint: `SMS for ${brand.brandName} no-branch customers` });
    }
  } else {
    for (let i = 0; i < blueprint.emailCount; i++) {
      yesSteps.push({ title: `Email ${i + 1}`, channel: "email", copyHint: `Email for ${brand.brandName}` });
    }
    for (let i = 0; i < blueprint.smsCount; i++) {
      yesSteps.push({ title: `SMS ${i + 1}`, channel: "sms", copyHint: `SMS for ${brand.brandName}` });
    }
  }

  const totalSteps = yesSteps.length + noSteps.length;
  const waits = Array.from({ length: Math.max(totalSteps - 1, 1) }, (_, i) => ({
    value: i === 0 ? 4 : 1,
    unit: (i === 0 ? "hours" : "days") as "hours" | "days"
  }));

  return {
    flowName: blueprint.name,
    triggerDescription: blueprint.triggerEvent,
    splitConditionTailored: blueprint.splitCondition,
    yesSteps,
    noSteps,
    notes: [{ title: "OBJECTIVE/FOCUS:", body: `${blueprint.name} flow for ${brand.brandName}`, attachToStep: 1 }],
    waitDurations: waits
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

  if (!content.notes || content.notes.length === 0) {
    content.notes = [{ title: "OBJECTIVE/FOCUS:", body: content.flowName, attachToStep: 1 }];
  }

  return content;
}
