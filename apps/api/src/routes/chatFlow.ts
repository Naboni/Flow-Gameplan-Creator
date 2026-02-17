import type { Request, Response } from "express";
import { getOpenAI } from "../lib/openai.js";
import type { BrandProfile } from "../lib/brandAnalyzer.js";
import { validateFlowGraph, type GraphError } from "@flow/core";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatFlowRequest = {
  message: string;
  history: ChatMessage[];
  brandProfile?: BrandProfile;
  currentFlowSpec?: unknown;
};

type ChatFlowResponse = {
  reply: string;
  flowSpec?: unknown;
  action: "clarify" | "confirm" | "generate" | "modify";
};

const HISTORY_MAX_MESSAGES = 6;
const MAX_REPAIR_ATTEMPTS = 2;

function asPositiveInt(value: unknown, fallback = 1): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.round(Math.abs(n)));
}

function normalizeFlowSpecCandidate(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const spec = structuredClone(input) as Record<string, unknown>;

  if (spec.defaults && typeof spec.defaults === "object") {
    const defaults = spec.defaults as Record<string, unknown>;
    if (defaults.delay && typeof defaults.delay === "object") {
      const delay = defaults.delay as Record<string, unknown>;
      delay.value = asPositiveInt(delay.value, 2);
      if (typeof delay.unit !== "string" || !["minutes", "hours", "days"].includes(delay.unit)) {
        delay.unit = "days";
      }
    }
  }

  if (Array.isArray(spec.nodes)) {
    spec.nodes = spec.nodes.map((node) => {
      if (!node || typeof node !== "object") return node;
      const n = node as Record<string, unknown>;
      if (n.type === "wait") {
        const duration = (n.duration && typeof n.duration === "object")
          ? (n.duration as Record<string, unknown>)
          : {};
        duration.value = asPositiveInt(duration.value, 1);
        if (typeof duration.unit !== "string" || !["minutes", "hours", "days"].includes(duration.unit)) {
          duration.unit = "days";
        }
        n.duration = duration;
      }
      if (n.type === "split") {
        if (Array.isArray(n.labels)) {
          const labels = n.labels.filter((l) => typeof l === "string" && l.trim().length > 0) as string[];
          n.labels = labels.length >= 2 ? labels : ["Yes", "No"];
        } else if (n.labels && typeof n.labels === "object") {
          const obj = n.labels as Record<string, unknown>;
          n.labels = [
            typeof obj.yes === "string" && obj.yes.trim() ? obj.yes : "Yes",
            typeof obj.no === "string" && obj.no.trim() ? obj.no : "No"
          ];
        } else {
          n.labels = ["Yes", "No"];
        }
      }
      return n;
    });
  }

  return spec;
}

function skeletonizeFlowSpec(spec: unknown): unknown {
  if (!spec || typeof spec !== "object") return spec;
  const s = spec as Record<string, unknown>;
  const nodes = Array.isArray(s.nodes) ? s.nodes : [];
  const edges = Array.isArray(s.edges) ? s.edges : [];

  const skeletonNodes = nodes.map((node: unknown) => {
    if (!node || typeof node !== "object") return node;
    const n = node as Record<string, unknown>;
    switch (n.type) {
      case "trigger":
        return { id: n.id, type: "trigger", title: n.title, event: n.event };
      case "wait":
        return { id: n.id, type: "wait", duration: n.duration };
      case "split":
        return { id: n.id, type: "split", title: n.title, condition: n.condition, labels: n.labels };
      case "merge":
        return { id: n.id, type: "merge", title: n.title || "Merge" };
      case "outcome":
        return { id: n.id, type: "outcome", title: n.title, result: n.result };
      case "message":
        return { id: n.id, type: "message", channel: n.channel, title: n.title };
      case "profileFilter":
        return { id: n.id, type: "profileFilter", title: n.title, filters: n.filters };
      default:
        return { id: n.id, type: n.type, title: n.title };
    }
  });

  const skeletonEdges = edges.map((e: unknown) => {
    if (!e || typeof e !== "object") return e;
    const edge = e as Record<string, unknown>;
    const base: Record<string, unknown> = { id: edge.id, from: edge.from, to: edge.to };
    if (edge.label) base.label = edge.label;
    return base;
  });

  return {
    id: s.id,
    name: s.name,
    channels: s.channels,
    nodes: skeletonNodes,
    edges: skeletonEdges
  };
}

function mergeWithOriginal(aiSpec: unknown, original: unknown): unknown {
  if (!aiSpec || typeof aiSpec !== "object") return aiSpec;
  if (!original || typeof original !== "object") return aiSpec;

  const ai = aiSpec as Record<string, unknown>;
  const orig = original as Record<string, unknown>;

  const origNodes = Array.isArray(orig.nodes) ? orig.nodes : [];
  const origNodeMap = new Map<string, Record<string, unknown>>();
  for (const node of origNodes) {
    if (node && typeof node === "object" && "id" in node) {
      origNodeMap.set((node as Record<string, unknown>).id as string, node as Record<string, unknown>);
    }
  }

  const aiNodes = Array.isArray(ai.nodes) ? ai.nodes : [];
  ai.nodes = aiNodes.map((aiNode: unknown) => {
    if (!aiNode || typeof aiNode !== "object") return aiNode;
    const n = aiNode as Record<string, unknown>;
    const origNode = origNodeMap.get(n.id as string);
    if (!origNode) return n;
    return { ...origNode, ...n };
  });

  if (!ai.source) ai.source = orig.source ?? { mode: "manual" };
  if (!ai.defaults) ai.defaults = orig.defaults ?? { delay: { value: 2, unit: "days" } };

  return ai;
}

const SYSTEM_PROMPT = `You are an expert email/SMS marketing flow architect. You help users build and modify flows as structured JSON.

Flow node types:
- trigger: { id, type:"trigger", title, event }
- wait: { id, type:"wait", duration:{ value:N, unit:"days"|"hours" } }
- message (email): { id, type:"message", channel:"email", title, copyHint, subjectLine, strategy:{ primaryFocus, secondaryFocus } }
- message (sms): { id, type:"message", channel:"sms", title, copyHint, strategy:{ primaryFocus, secondaryFocus } }
- split: { id, type:"split", title, condition, labels:["Yes","No"] }  (labels array can have 2+ items for multi-way splits)
- merge: { id, type:"merge", title:"Merge" }
- outcome: { id, type:"outcome", title:"End", result:"Completed" }

Edge: { id:"e_from_to", from:"source_id", to:"target_id", label:"optional" }
Split edges MUST have label matching the split's labels. Node IDs: alphanumeric/underscore/dash only.

STRUCTURAL RULES (CRITICAL — violations will be automatically detected and rejected):
1. The flow is a directed acyclic graph (DAG). EVERY node must be reachable from the trigger. No orphan nodes.
2. Every path from the trigger MUST terminate at an outcome node. No dead ends.
3. Every non-outcome node must have at least one outgoing edge.
4. When a split creates N branches, each branch MUST have its OWN SEPARATE chain of nodes. Two branches must NEVER point to the same node. Each split branch target must be unique.
5. When modifying a flow, preserve all existing node IDs and edges that are not being changed. Only add/remove/rewire the parts the user asked to change. Do NOT create disconnected subgraphs.
6. When the user says "add a split after node X": insert the new split node between X and X's current child. Rewire: X → new_split, then new_split → branch_a (Yes), new_split → branch_b (No), and connect each branch back to an outcome or continue the flow.
7. When each branch of a split needs its own sub-split, create SEPARATE split nodes for each branch — do NOT merge both branches into one shared split.

EXAMPLE — adding a split after Email_2 with sub-splits:
Before: Email_2 → Wait_3 → Email_3 → Outcome
After adding engagement split with sub-splits on each branch:
  Email_2 → Engagement_Split
  Engagement_Split →(Yes)→ Engaged_Email → Sub_Split_A
  Sub_Split_A →(Yes)→ ... → Outcome_1
  Sub_Split_A →(No)→ ... → Outcome_2
  Engagement_Split →(No)→ NotEngaged_Email → Sub_Split_B
  Sub_Split_B →(Yes)→ ... → Outcome_3
  Sub_Split_B →(No)→ ... → Outcome_4
Note: Sub_Split_A and Sub_Split_B are SEPARATE nodes. Each branch has its own subtree.

BEHAVIOR RULES:
- When user describes a flow, first confirm the structure briefly (1-2 sentences), then ask for confirmation.
- When user confirms (says yes/ok/go/proceed), output the FlowSpec JSON immediately.
- For modifications, you receive a skeleton of the current flow. Output the COMPLETE updated flow.
- Keep JSON compact: for message nodes include at minimum { id, type, channel, title, copyHint(short), subjectLine(if email) }. Strategy and other fields are optional but appreciated.
- Use wait values >= 1. Default timing: 2 days between emails, 1 day before SMS.
- Do NOT invent discount codes.
- Write copyHint as real customer-facing text, NOT designer instructions.

Output format when generating/modifying — include BOTH a brief reply AND the JSON block:
\`\`\`flowspec
{ "id":"...", "name":"...", "source":{"mode":"manual"}, "channels":["email","sms"], "defaults":{"delay":{"value":2,"unit":"days"}}, "nodes":[...], "edges":[...] }
\`\`\``;

function buildBrandContext(profile?: BrandProfile): string {
  if (!profile?.brandName) return "";
  const parts = [`Brand: ${profile.brandName}`];
  if (profile.industry) parts.push(`Industry: ${profile.industry}`);
  if (profile.targetAudience) parts.push(`Audience: ${profile.targetAudience}`);
  return "\n\nBrand context: " + parts.join(", ");
}

function extractFlowSpec(text: string): { flowSpec: unknown | null; hadBlock: boolean } {
  const match = text.match(/```flowspec\s*([\s\S]*?)```/);
  if (!match) return { flowSpec: null, hadBlock: false };
  try {
    return { flowSpec: JSON.parse(match[1].trim()), hadBlock: true };
  } catch {
    return { flowSpec: null, hadBlock: true };
  }
}

function cleanReply(text: string, hadValidSpec: boolean): string {
  if (!hadValidSpec) return text.trim();
  return text.replace(/```flowspec[\s\S]*?```/g, "").trim();
}

function determineAction(text: string, hasFlowSpec: boolean): ChatFlowResponse["action"] {
  if (hasFlowSpec) {
    const lower = text.toLowerCase();
    if (lower.includes("updated") || lower.includes("modified") || lower.includes("changed")) {
      return "modify";
    }
    return "generate";
  }
  const lower = text.toLowerCase();
  if (lower.includes("should i") || lower.includes("shall i") || lower.includes("want me to") || lower.includes("confirm")) {
    return "confirm";
  }
  return "clarify";
}

function formatGraphErrors(errors: GraphError[]): string {
  return errors.map((e, i) => `${i + 1}. [${e.code}] ${e.message}`).join("\n");
}

export async function chatFlowRoute(req: Request, res: Response) {
  const startedAt = Date.now();
  try {
    const body = req.body as ChatFlowRequest;
    if (!body.message?.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const openai = getOpenAI();
    const brandCtx = buildBrandContext(body.brandProfile);

    const skeleton = body.currentFlowSpec ? skeletonizeFlowSpec(body.currentFlowSpec) : null;
    const currentFlowCtx = skeleton
      ? `\n\nCurrent flow (structural skeleton — modify and return full updated flow):\n${JSON.stringify(skeleton)}`
      : "";

    const systemContent = SYSTEM_PROMPT + brandCtx + currentFlowCtx;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemContent }
    ];

    const trimmedHistory = (body.history ?? []).slice(-HISTORY_MAX_MESSAGES);
    for (const msg of trimmedHistory) {
      messages.push({ role: msg.role, content: msg.content.slice(0, 800) });
    }
    messages.push({ role: "user", content: body.message });

    console.log(`[chat-flow] calling OpenAI (${messages.length} messages, system=${systemContent.length} chars)...`);

    let flowSpec: unknown | null = null;
    let rawReply = "";
    let hadBlock = false;
    let totalTokens = 0;

    // Initial call + up to MAX_REPAIR_ATTEMPTS retries
    for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      const isRetry = attempt > 0;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        temperature: isRetry ? 0.3 : 0.7,
        max_tokens: 8192,
      });

      totalTokens += completion.usage?.total_tokens ?? 0;
      rawReply = completion.choices[0]?.message?.content ?? "I couldn't generate a response. Please try again.";
      const extracted = extractFlowSpec(rawReply);
      hadBlock = extracted.hadBlock;

      if (!extracted.flowSpec) {
        // No JSON block — either a clarification/confirmation or malformed output
        break;
      }

      let candidate = normalizeFlowSpecCandidate(extracted.flowSpec);
      if (candidate && body.currentFlowSpec) {
        candidate = mergeWithOriginal(candidate, body.currentFlowSpec);
      }

      // Run graph validation
      const graphResult = validateFlowGraph(candidate);
      if (graphResult.valid) {
        flowSpec = candidate;
        console.log(`[chat-flow] attempt ${attempt + 1}: graph valid`);
        break;
      }

      // Graph validation failed — attempt auto-repair
      const errorSummary = formatGraphErrors(graphResult.errors);
      console.log(`[chat-flow] attempt ${attempt + 1}: graph invalid (${graphResult.errors.length} errors):\n${errorSummary}`);

      if (attempt < MAX_REPAIR_ATTEMPTS) {
        // Feed errors back to AI for repair
        messages.push({ role: "assistant", content: rawReply });
        messages.push({
          role: "user",
          content: `Your FlowSpec JSON has structural errors that must be fixed:\n${errorSummary}\n\nPlease output the CORRECTED complete FlowSpec JSON fixing all the above errors. Remember: every node must be reachable from the trigger, every path must end at an outcome, and split branches must not share target nodes.`
        });
        console.log(`[chat-flow] requesting auto-repair (attempt ${attempt + 2})...`);
      } else {
        // Max retries exhausted — return what we have with error info
        flowSpec = candidate;
        console.log(`[chat-flow] max repair attempts exhausted, returning with known issues`);
      }
    }

    const reply = cleanReply(rawReply, !!flowSpec);
    const action = determineAction(rawReply, !!flowSpec);

    const response: ChatFlowResponse = { reply, action, ...(flowSpec ? { flowSpec } : {}) };

    if (!flowSpec && hadBlock) {
      response.reply = `${reply}\n\nThe JSON was malformed. Please say "regenerate" and I will output clean JSON.`;
    }

    console.log(`[chat-flow] done in ${Date.now() - startedAt}ms (hasFlowSpec=${!!flowSpec}, totalTokens=${totalTokens})`);
    return res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[chat-flow] error after ${Date.now() - startedAt}ms:`, message);
    return res.status(500).json({ error: "AI request failed. Please try again." });
  }
}
