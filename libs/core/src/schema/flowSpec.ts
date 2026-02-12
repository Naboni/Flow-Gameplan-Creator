import { z } from "zod";

const nodeIdSchema = z
  .string()
  .min(1, "Node id is required.")
  .regex(/^[a-z0-9_-]+$/i, "Node id must be alphanumeric, underscore, or dash.");

const edgeIdSchema = z
  .string()
  .min(1, "Edge id is required.")
  .regex(/^[a-z0-9_-]+$/i, "Edge id must be alphanumeric, underscore, or dash.");

export const channelSchema = z.enum(["email", "sms"]);
export type Channel = z.infer<typeof channelSchema>;

export const delayUnitSchema = z.enum(["minutes", "hours", "days"]);
export type DelayUnit = z.infer<typeof delayUnitSchema>;

export const sourceSchema = z.object({
  mode: z.enum(["manual", "template"]),
  templateKey: z.enum(["core-foundation", "growth-engine", "full-system"]).optional()
}).superRefine((value, ctx) => {
  if (value.mode === "template" && !value.templateKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "templateKey is required when source.mode is template.",
      path: ["templateKey"]
    });
  }
  if (value.mode === "manual" && value.templateKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "templateKey must not be set when source.mode is manual.",
      path: ["templateKey"]
    });
  }
});

const triggerNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.literal("trigger"),
  title: z.string().min(1),
  event: z.string().min(1),
  description: z.string().optional()
});

const profileFilterNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.literal("profileFilter"),
  title: z.string().min(1),
  filters: z.array(z.string().min(1)).min(1)
});

const splitNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.literal("split"),
  title: z.string().min(1),
  condition: z.string().min(1),
  labels: z.object({
    yes: z.string().min(1).default("Yes"),
    no: z.string().min(1).default("No")
  }).default({ yes: "Yes", no: "No" })
});

const waitNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.literal("wait"),
  duration: z.object({
    value: z.number().int().positive(),
    unit: delayUnitSchema
  })
});

const objectiveFocusSchema = z.object({
  title: z.string().min(1),
  bullets: z.array(z.string().min(1)).min(1)
});

const messageNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.literal("message"),
  channel: channelSchema,
  title: z.string().min(1),
  stepIndex: z.number().int().positive().optional(),
  copyHint: z.string().optional(),
  objectiveFocus: objectiveFocusSchema.optional(),
  tags: z.array(z.string().min(1)).optional()
});

const outcomeNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.literal("outcome"),
  title: z.string().min(1),
  result: z.string().min(1)
});

const noteNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.literal("note"),
  title: z.string().min(1),
  body: z.string().min(1)
});

const strategyNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.literal("strategy"),
  title: z.string().min(1),
  primaryFocus: z.string().min(1),
  secondaryFocus: z.string().min(1),
  branchLabel: z.enum(["yes", "no"]).optional()
});

export const flowNodeSchema = z.discriminatedUnion("type", [
  triggerNodeSchema,
  profileFilterNodeSchema,
  splitNodeSchema,
  waitNodeSchema,
  messageNodeSchema,
  outcomeNodeSchema,
  noteNodeSchema,
  strategyNodeSchema
]);
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowEdgeSchema = z.object({
  id: edgeIdSchema,
  from: nodeIdSchema,
  to: nodeIdSchema,
  label: z.string().optional()
});
export type FlowEdge = z.infer<typeof flowEdgeSchema>;

export const flowSpecSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/i, "Flow id must be alphanumeric, underscore, or dash."),
  name: z.string().min(1),
  source: sourceSchema.default({ mode: "manual" }),
  channels: z.array(channelSchema).min(1),
  defaults: z.object({
    delay: z.object({
      value: z.number().int().positive().default(2),
      unit: delayUnitSchema.default("days")
    }).default({ value: 2, unit: "days" })
  }).default({ delay: { value: 2, unit: "days" } }),
  ui: z.object({
    nodePositions: z.record(
      nodeIdSchema,
      z.object({
        x: z.number(),
        y: z.number()
      })
    ).optional()
  }).optional(),
  nodes: z.array(flowNodeSchema).min(2),
  edges: z.array(flowEdgeSchema).min(1)
}).superRefine((spec, ctx) => {
  const nodeIdSet = new Set<string>();
  const edgeIdSet = new Set<string>();
  let triggerCount = 0;
  let splitCount = 0;

  for (const node of spec.nodes) {
    if (nodeIdSet.has(node.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate node id: ${node.id}`,
        path: ["nodes"]
      });
    }
    nodeIdSet.add(node.id);

    if (node.type === "trigger") {
      triggerCount += 1;
    }
    if (node.type === "split") {
      splitCount += 1;
    }
    if (node.type === "message" && !spec.channels.includes(node.channel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Message node ${node.id} uses channel "${node.channel}" not present in flow.channels.`,
        path: ["nodes"]
      });
    }
  }

  if (triggerCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Flow must contain exactly one trigger node.",
      path: ["nodes"]
    });
  }

  if (splitCount > 0) {
    const splitIds = new Set(spec.nodes.filter((n) => n.type === "split").map((n) => n.id));
    for (const splitId of splitIds) {
      const outgoing = spec.edges.filter((edge) => edge.from === splitId);
      const labels = new Set(outgoing.map((edge) => edge.label?.toLowerCase()));
      if (!labels.has("yes") || !labels.has("no")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Split node ${splitId} must have both Yes and No outgoing edges.`,
          path: ["edges"]
        });
      }
    }
  }

  for (const edge of spec.edges) {
    if (edgeIdSet.has(edge.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate edge id: ${edge.id}`,
        path: ["edges"]
      });
    }
    edgeIdSet.add(edge.id);

    if (!nodeIdSet.has(edge.from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Edge ${edge.id} references missing source node ${edge.from}.`,
        path: ["edges"]
      });
    }
    if (!nodeIdSet.has(edge.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Edge ${edge.id} references missing destination node ${edge.to}.`,
        path: ["edges"]
      });
    }
  }

  if (spec.ui?.nodePositions) {
    for (const nodeId of Object.keys(spec.ui.nodePositions)) {
      if (!nodeIdSet.has(nodeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ui.nodePositions contains unknown node id ${nodeId}.`,
          path: ["ui", "nodePositions"]
        });
      }
    }
  }
});

export type FlowSpec = z.infer<typeof flowSpecSchema>;

export function parseFlowSpec(input: unknown): FlowSpec {
  return flowSpecSchema.parse(input);
}

export function parseFlowSpecSafe(input: unknown) {
  return flowSpecSchema.safeParse(input);
}

export function formatDelay(value: number, unit: DelayUnit): string {
  const normalized = Math.abs(value);
  const singularMap: Record<DelayUnit, string> = {
    minutes: "minute",
    hours: "hour",
    days: "day"
  };
  const noun = normalized === 1 ? singularMap[unit] : unit;
  return `${normalized} ${noun}`;
}
