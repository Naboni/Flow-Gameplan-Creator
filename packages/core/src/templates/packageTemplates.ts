import type { DelayUnit, FlowSpec } from "../schema/flowSpec.js";
import { parseFlowSpec } from "../schema/flowSpec.js";

export type PackageTemplateKey = "core-foundation" | "growth-engine" | "full-system";
type SegmentKey = "yes" | "no";

type DelayConfig = {
  value: number;
  unit: DelayUnit;
};

type FlowCounts = {
  email: number;
  sms: number;
};

type SplitFlowBlueprint = {
  id: string;
  name: string;
  triggerEvent: string;
  splitCondition: string;
  yesCounts: FlowCounts;
  noCounts: FlowCounts;
  yesLabel?: string;
  noLabel?: string;
};

type LinearFlowBlueprint = {
  id: string;
  name: string;
  triggerEvent: string;
  emailCount: number;
  smsCount: number;
};

export type ExpandedPackage = {
  templateKey: PackageTemplateKey;
  flows: FlowSpec[];
  mirrors: Array<{
    flowId: string;
    mirrorsFlowId: string;
  }>;
};

export type ExpandTemplateOptions = {
  defaultDelay?: DelayConfig;
};

const DEFAULT_DELAY: DelayConfig = { value: 1, unit: "days" };

function withDelay(options?: ExpandTemplateOptions): DelayConfig {
  return options?.defaultDelay ?? DEFAULT_DELAY;
}

function createWaitNodeId(prefix: string, branchKey: string, lane: string, index: number): string {
  return `${prefix}_${branchKey}_${lane}_wait_${index}`;
}

function createMessageNodeId(prefix: string, branchKey: string, lane: string, index: number): string {
  return `${prefix}_${branchKey}_${lane}_${index}`;
}

function createLinearFlow(
  blueprint: LinearFlowBlueprint,
  delay: DelayConfig
): FlowSpec {
  const flowId = blueprint.id;
  const hasEmail = blueprint.emailCount > 0;
  const hasSms = blueprint.smsCount > 0;
  const channels: FlowSpec["channels"] = [
    ...(hasEmail ? (["email"] as const) : []),
    ...(hasSms ? (["sms"] as const) : [])
  ];

  const nodes: FlowSpec["nodes"] = [
    {
      id: `${flowId}_trigger`,
      type: "trigger",
      title: "Trigger",
      event: blueprint.triggerEvent
    }
  ];

  const edges: FlowSpec["edges"] = [];

  function buildLane(channel: "email" | "sms", count: number): string | null {
    if (count <= 0) {
      return null;
    }

    let previousId = `${flowId}_trigger`;
    for (let i = 1; i <= count; i += 1) {
      const messageId = createMessageNodeId(flowId, "linear", channel, i);
      nodes.push({
        id: messageId,
        type: "message",
        channel,
        title: `${channel.toUpperCase()} ${i}`,
        stepIndex: i
      });
      edges.push({
        id: `${flowId}_e_${previousId}_to_${messageId}`,
        from: previousId,
        to: messageId
      });
      previousId = messageId;
      if (i < count) {
        const waitId = createWaitNodeId(flowId, "linear", channel, i);
        nodes.push({
          id: waitId,
          type: "wait",
          duration: delay
        });
        edges.push({
          id: `${flowId}_e_${previousId}_to_${waitId}`,
          from: previousId,
          to: waitId
        });
        previousId = waitId;
      }
    }
    return previousId;
  }

  const laneEnds = [
    buildLane("email", blueprint.emailCount),
    buildLane("sms", blueprint.smsCount)
  ].filter(Boolean) as string[];

  const outcomeId = `${flowId}_outcome`;
  nodes.push({
    id: outcomeId,
    type: "outcome",
    title: "Outcome",
    result: "Flow completed"
  });

  for (const laneEnd of laneEnds) {
    edges.push({
      id: `${flowId}_e_${laneEnd}_to_${outcomeId}`,
      from: laneEnd,
      to: outcomeId
    });
  }

  return parseFlowSpec({
    id: flowId,
    name: blueprint.name,
    source: {
      mode: "template",
      templateKey: "core-foundation"
    },
    channels,
    defaults: {
      delay
    },
    nodes,
    edges
  });
}

function buildBranchLane(
  nodes: FlowSpec["nodes"],
  edges: FlowSpec["edges"],
  flowId: string,
  splitId: string,
  delay: DelayConfig,
  branchKey: SegmentKey,
  branchLabel: string,
  channel: "email" | "sms",
  count: number
): string | null {
  if (count <= 0) {
    return null;
  }

  let previousId = splitId;
  for (let i = 1; i <= count; i += 1) {
    const messageId = createMessageNodeId(flowId, branchKey, channel, i);
    nodes.push({
      id: messageId,
      type: "message",
      channel,
      title: `${channel.toUpperCase()} ${i} (${branchLabel})`,
      stepIndex: i
    });
    edges.push({
      id: `${flowId}_e_${previousId}_to_${messageId}_${channel}_${branchKey}_${i}`,
      from: previousId,
      to: messageId,
      label: previousId === splitId ? branchLabel : undefined
    });
    previousId = messageId;

    if (i < count) {
      const waitId = createWaitNodeId(flowId, branchKey, channel, i);
      nodes.push({
        id: waitId,
        type: "wait",
        duration: delay
      });
      edges.push({
        id: `${flowId}_e_${previousId}_to_${waitId}`,
        from: previousId,
        to: waitId
      });
      previousId = waitId;
    }
  }
  return previousId;
}

function createSplitFlow(
  blueprint: SplitFlowBlueprint,
  delay: DelayConfig
): FlowSpec {
  const flowId = blueprint.id;
  const yesLabel = blueprint.yesLabel ?? "Yes";
  const noLabel = blueprint.noLabel ?? "No";
  const channels: FlowSpec["channels"] = [
    ...(blueprint.yesCounts.email > 0 || blueprint.noCounts.email > 0 ? (["email"] as const) : []),
    ...(blueprint.yesCounts.sms > 0 || blueprint.noCounts.sms > 0 ? (["sms"] as const) : [])
  ];

  const triggerId = `${flowId}_trigger`;
  const splitId = `${flowId}_split`;
  const nodes: FlowSpec["nodes"] = [
    {
      id: triggerId,
      type: "trigger",
      title: "Trigger",
      event: blueprint.triggerEvent
    },
    {
      id: splitId,
      type: "split",
      title: "Conditional Split",
      condition: blueprint.splitCondition,
      labels: {
        yes: yesLabel,
        no: noLabel
      }
    }
  ];
  const edges: FlowSpec["edges"] = [
    {
      id: `${flowId}_e_${triggerId}_to_${splitId}`,
      from: triggerId,
      to: splitId
    }
  ];

  const yesLaneEnds = [
    buildBranchLane(nodes, edges, flowId, splitId, delay, "yes", yesLabel, "email", blueprint.yesCounts.email),
    buildBranchLane(nodes, edges, flowId, splitId, delay, "yes", yesLabel, "sms", blueprint.yesCounts.sms)
  ].filter(Boolean) as string[];

  const noLaneEnds = [
    buildBranchLane(nodes, edges, flowId, splitId, delay, "no", noLabel, "email", blueprint.noCounts.email),
    buildBranchLane(nodes, edges, flowId, splitId, delay, "no", noLabel, "sms", blueprint.noCounts.sms)
  ].filter(Boolean) as string[];

  const yesOutcomeId = `${flowId}_outcome_yes`;
  const noOutcomeId = `${flowId}_outcome_no`;
  nodes.push({
    id: yesOutcomeId,
    type: "outcome",
    title: "Outcome",
    result: `${yesLabel} branch completed`
  });
  nodes.push({
    id: noOutcomeId,
    type: "outcome",
    title: "Outcome",
    result: `${noLabel} branch completed`
  });

  for (const laneEnd of yesLaneEnds) {
    edges.push({
      id: `${flowId}_e_${laneEnd}_to_${yesOutcomeId}`,
      from: laneEnd,
      to: yesOutcomeId
    });
  }
  for (const laneEnd of noLaneEnds) {
    edges.push({
      id: `${flowId}_e_${laneEnd}_to_${noOutcomeId}`,
      from: laneEnd,
      to: noOutcomeId
    });
  }

  return parseFlowSpec({
    id: flowId,
    name: blueprint.name,
    source: {
      mode: "template",
      templateKey: "core-foundation"
    },
    channels,
    defaults: {
      delay
    },
    nodes,
    edges
  });
}

function mirrorFlow(base: FlowSpec, id: string, name: string, triggerEvent: string): FlowSpec {
  const nodeMap = new Map<string, string>();
  const mappedNodes = base.nodes.map((node) => {
    const mappedId = node.id.replace(new RegExp(`^${base.id}`), id);
    nodeMap.set(node.id, mappedId);
    if (node.type === "trigger") {
      return {
        ...node,
        id: mappedId,
        event: triggerEvent
      };
    }
    return {
      ...node,
      id: mappedId
    };
  });

  const mappedEdges = base.edges.map((edge) => ({
    ...edge,
    id: edge.id.replace(new RegExp(`^${base.id}`), id),
    from: nodeMap.get(edge.from) ?? edge.from,
    to: nodeMap.get(edge.to) ?? edge.to
  }));

  return parseFlowSpec({
    ...base,
    id,
    name,
    nodes: mappedNodes,
    edges: mappedEdges
  });
}

function attachTemplateKey(flows: FlowSpec[], templateKey: PackageTemplateKey): FlowSpec[] {
  return flows.map((flow) =>
    parseFlowSpec({
      ...flow,
      source: {
        mode: "template",
        templateKey
      }
    })
  );
}

function buildCoreFoundation(options?: ExpandTemplateOptions): ExpandedPackage {
  const delay = withDelay(options);
  const emailWelcome = createLinearFlow(
    {
      id: "core_email_welcome",
      name: "Email Welcome",
      triggerEvent: "When someone subscribes",
      emailCount: 3,
      smsCount: 0
    },
    delay
  );
  const smsWelcome = createLinearFlow(
    {
      id: "core_sms_welcome",
      name: "SMS Welcome",
      triggerEvent: "When someone opts in to SMS",
      emailCount: 0,
      smsCount: 2
    },
    delay
  );
  const checkoutAbandonment = createLinearFlow(
    {
      id: "core_checkout_abandonment",
      name: "Checkout Abandonment",
      triggerEvent: "When someone starts checkout but does not purchase",
      emailCount: 2,
      smsCount: 2
    },
    delay
  );
  const cartAbandonment = mirrorFlow(
    checkoutAbandonment,
    "core_cart_abandonment",
    "Cart Abandonment",
    "When someone adds to cart but does not purchase"
  );
  const browseAbandonment = createLinearFlow(
    {
      id: "core_browse_abandonment",
      name: "Browse Abandonment",
      triggerEvent: "When someone views products but does not add to cart",
      emailCount: 2,
      smsCount: 2
    },
    delay
  );
  const postPurchase = createLinearFlow(
    {
      id: "core_post_purchase",
      name: "Post-Purchase",
      triggerEvent: "When someone places an order",
      emailCount: 1,
      smsCount: 1
    },
    delay
  );

  const flows = attachTemplateKey(
    [
      emailWelcome,
      smsWelcome,
      checkoutAbandonment,
      cartAbandonment,
      browseAbandonment,
      postPurchase
    ],
    "core-foundation"
  );

  return {
    templateKey: "core-foundation",
    flows,
    mirrors: [{ flowId: "core_cart_abandonment", mirrorsFlowId: "core_checkout_abandonment" }]
  };
}

function buildGrowthEngine(options?: ExpandTemplateOptions): ExpandedPackage {
  const delay = withDelay(options);
  const core = buildCoreFoundation(options);

  const emailWelcome = createSplitFlow(
    {
      id: "growth_email_welcome",
      name: "Email Welcome",
      triggerEvent: "When someone subscribes",
      splitCondition: "Has placed order at least once",
      yesCounts: { email: 1, sms: 0 },
      noCounts: { email: 3, sms: 0 },
      yesLabel: "Yes",
      noLabel: "No"
    },
    delay
  );
  const smsWelcome = createSplitFlow(
    {
      id: "growth_sms_welcome",
      name: "SMS Welcome",
      triggerEvent: "When someone opts in to SMS",
      splitCondition: "Has placed order at least once",
      yesCounts: { email: 0, sms: 1 },
      noCounts: { email: 0, sms: 2 },
      yesLabel: "Yes",
      noLabel: "No"
    },
    delay
  );
  const checkoutAbandonment = createSplitFlow(
    {
      id: "growth_checkout_abandonment",
      name: "Checkout Abandonment",
      triggerEvent: "When someone starts checkout but does not purchase",
      splitCondition: "Has purchase history",
      yesCounts: { email: 3, sms: 2 },
      noCounts: { email: 3, sms: 2 }
    },
    delay
  );
  const cartAbandonment = mirrorFlow(
    checkoutAbandonment,
    "growth_cart_abandonment",
    "Cart Abandonment",
    "When someone adds to cart but does not purchase"
  );
  const browseAbandonment = createSplitFlow(
    {
      id: "growth_browse_abandonment",
      name: "Browse Abandonment",
      triggerEvent: "When someone browses products but does not add to cart",
      splitCondition: "Has purchase history",
      yesCounts: { email: 3, sms: 2 },
      noCounts: { email: 3, sms: 2 }
    },
    delay
  );
  const siteAbandonment = createLinearFlow(
    {
      id: "growth_site_abandonment",
      name: "Site Abandonment",
      triggerEvent: "When someone visits site and exits without product view",
      emailCount: 2,
      smsCount: 0
    },
    delay
  );
  const postPurchase = createSplitFlow(
    {
      id: "growth_post_purchase",
      name: "Post-Purchase",
      triggerEvent: "When someone places an order",
      splitCondition: "Has purchase history",
      yesCounts: { email: 2, sms: 1 },
      noCounts: { email: 1, sms: 1 }
    },
    delay
  );
  const winback = createLinearFlow(
    {
      id: "growth_winback",
      name: "Winback",
      triggerEvent: "When customer is inactive for defined window",
      emailCount: 2,
      smsCount: 0
    },
    delay
  );

  const flows = attachTemplateKey(
    [
      ...core.flows.filter((flow) => flow.id.startsWith("core_")).map((flow) =>
        parseFlowSpec({
          ...flow,
          id: flow.id.replace("core_", "growth_"),
          name: flow.name
        })
      ),
      emailWelcome,
      smsWelcome,
      checkoutAbandonment,
      cartAbandonment,
      browseAbandonment,
      siteAbandonment,
      postPurchase,
      winback
    ],
    "growth-engine"
  );

  const uniqueFlows = Array.from(new Map(flows.map((flow) => [flow.id, flow])).values());
  return {
    templateKey: "growth-engine",
    flows: uniqueFlows,
    mirrors: [{ flowId: "growth_cart_abandonment", mirrorsFlowId: "growth_checkout_abandonment" }]
  };
}

function buildFullSystem(options?: ExpandTemplateOptions): ExpandedPackage {
  const delay = withDelay(options);

  const emailWelcome = createSplitFlow(
    {
      id: "full_email_welcome",
      name: "Email Welcome",
      triggerEvent: "When someone subscribes",
      splitCondition: "Has placed order at least once",
      yesCounts: { email: 2, sms: 0 },
      noCounts: { email: 4, sms: 0 }
    },
    delay
  );
  const smsWelcome = createSplitFlow(
    {
      id: "full_sms_welcome",
      name: "SMS Welcome",
      triggerEvent: "When someone opts in to SMS",
      splitCondition: "Has placed order at least once",
      yesCounts: { email: 0, sms: 1 },
      noCounts: { email: 0, sms: 3 }
    },
    delay
  );
  const checkoutAbandonment = createSplitFlow(
    {
      id: "full_checkout_abandonment",
      name: "Checkout Abandonment",
      triggerEvent: "When someone starts checkout but does not purchase",
      splitCondition: "Has purchase history",
      yesCounts: { email: 4, sms: 2 },
      noCounts: { email: 4, sms: 2 }
    },
    delay
  );
  const cartAbandonment = mirrorFlow(
    checkoutAbandonment,
    "full_cart_abandonment",
    "Cart Abandonment",
    "When someone adds to cart but does not purchase"
  );
  const browseAbandonment = createSplitFlow(
    {
      id: "full_browse_abandonment",
      name: "Browse Abandonment",
      triggerEvent: "When someone browses products but does not add to cart",
      splitCondition: "Has purchase history",
      yesCounts: { email: 4, sms: 2 },
      noCounts: { email: 4, sms: 2 }
    },
    delay
  );
  const siteAbandonment = createLinearFlow(
    {
      id: "full_site_abandonment",
      name: "Site Abandonment",
      triggerEvent: "When someone visits site and exits without product view",
      emailCount: 3,
      smsCount: 0
    },
    delay
  );
  const postPurchase = createSplitFlow(
    {
      id: "full_post_purchase",
      name: "Post-Purchase",
      triggerEvent: "When someone places an order",
      splitCondition: "Has purchase history",
      yesCounts: { email: 3, sms: 2 },
      noCounts: { email: 3, sms: 1 }
    },
    delay
  );
  const winback = createSplitFlow(
    {
      id: "full_winback",
      name: "Winback",
      triggerEvent: "When customer is inactive for defined window",
      splitCondition: "Has purchase history",
      yesCounts: { email: 3, sms: 0 },
      noCounts: { email: 3, sms: 0 }
    },
    delay
  );
  const sunset = createLinearFlow(
    {
      id: "full_sunset",
      name: "Sunset",
      triggerEvent: "When subscriber remains inactive after winback",
      emailCount: 3,
      smsCount: 0
    },
    delay
  );

  const flows = attachTemplateKey(
    [
      emailWelcome,
      smsWelcome,
      checkoutAbandonment,
      cartAbandonment,
      browseAbandonment,
      siteAbandonment,
      postPurchase,
      winback,
      sunset
    ],
    "full-system"
  );

  return {
    templateKey: "full-system",
    flows,
    mirrors: [{ flowId: "full_cart_abandonment", mirrorsFlowId: "full_checkout_abandonment" }]
  };
}

export function expandPackageTemplate(
  templateKey: PackageTemplateKey,
  options?: ExpandTemplateOptions
): ExpandedPackage {
  if (templateKey === "core-foundation") {
    return buildCoreFoundation(options);
  }
  if (templateKey === "growth-engine") {
    return buildGrowthEngine(options);
  }
  return buildFullSystem(options);
}
