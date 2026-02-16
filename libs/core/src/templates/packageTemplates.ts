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

const MESSAGING_FOCI = [
  "Introduction & Engagement",
  "Service Highlights & Value Proposition",
  "Re-engagement & Conversion",
  "Final Urgency, Stock & Scarcity"
] as const;

/* ── Strategy templates per flow type ── */

const STRATEGY_BY_FLOW_TYPE: Record<string, { primary: string; secondary: string }> = {
  "Email Welcome": {
    primary: "Create a strong first impression and set expectations for the relationship.",
    secondary: "Introduce brand values and guide subscribers toward their first purchase."
  },
  "SMS Welcome": {
    primary: "Establish the SMS channel as high-value and time-sensitive.",
    secondary: "Drive immediate engagement with concise, mobile-optimized messaging."
  },
  "Checkout Abandonment": {
    primary: "Recover abandoned checkouts by addressing friction and urgency.",
    secondary: "Reinforce product value and offer support to complete the purchase."
  },
  "Cart Abandonment": {
    primary: "Remind shoppers of items left in cart and drive them back to purchase.",
    secondary: "Use social proof and scarcity to motivate action."
  },
  "Browse Abandonment": {
    primary: "Re-engage browsers with personalized product recommendations.",
    secondary: "Build consideration through reviews, comparisons, and value messaging."
  },
  "Site Abandonment": {
    primary: "Recapture visitors who left without browsing products.",
    secondary: "Highlight bestsellers and trending items to spark interest."
  },
  "Post-Purchase": {
    primary: "Build loyalty and increase customer lifetime value after purchase.",
    secondary: "Drive reviews, referrals, and repeat purchases through cross-sell."
  },
  "Winback": {
    primary: "Re-engage lapsed customers and rekindle interest in the brand.",
    secondary: "Use escalating incentives and emotional appeals to win them back."
  },
  "Sunset": {
    primary: "Clean the list by identifying truly disengaged subscribers.",
    secondary: "Give a final chance to re-engage before suppression."
  }
};

/* ── Title templates for more descriptive message names ── */

const TITLE_TEMPLATES: Record<string, string[]> = {
  "Email Welcome": ["Welcome!", "Our Story", "Why Customers Love Us", "Exclusive Benefits", "Your Special Offer"],
  "SMS Welcome": ["Welcome — Quick Intro", "Don't Miss Out", "Exclusive for You"],
  "Checkout Abandonment": ["Complete Your Order", "Still Thinking?", "Your Cart is Waiting", "Final Reminder"],
  "Cart Abandonment": ["You Left Something Behind", "Still Interested?", "Your Items Are Going Fast", "Last Chance"],
  "Browse Abandonment": ["We Noticed You Looking", "Curated Just for You", "Trending Now", "See What's New"],
  "Site Abandonment": ["Welcome Back", "Discover Our Bestsellers", "What You're Missing"],
  "Post-Purchase": ["Order Confirmed!", "How's Your Purchase?", "You Might Also Like", "Leave a Review"],
  "Winback": ["We Miss You!", "A Lot Has Changed", "Come Back for Something Special"],
  "Sunset": ["Are You Still There?", "Last Chance to Stay", "We're Saying Goodbye"]
};

/* ── Helpers ── */

function withDelay(options?: ExpandTemplateOptions): DelayConfig {
  return options?.defaultDelay ?? DEFAULT_DELAY;
}

function getMessageTitle(flowName: string, stepIndex: number, channel: "email" | "sms", branchLabel?: string): string {
  const titles = TITLE_TEMPLATES[flowName];
  const suffix = branchLabel ? ` (${branchLabel})` : "";
  if (titles && titles[stepIndex - 1]) {
    return `${titles[stepIndex - 1]}${suffix}`;
  }
  return `${channel === "email" ? "Email" : "SMS"} ${stepIndex}${suffix}`;
}

function getMessageContent(
  stepIndex: number,
  totalSteps: number,
  channel: "email" | "sms",
  flowName: string,
  isFirstInBranch: boolean,
  branchLabel?: string
) {
  const focus = MESSAGING_FOCI[Math.min(stepIndex - 1, MESSAGING_FOCI.length - 1)];
  const includeDiscount = stepIndex >= Math.max(2, totalSteps - 1);
  const strategyEntry = STRATEGY_BY_FLOW_TYPE[flowName];

  return {
    copyHint: `${channel === "email" ? "Email" : "SMS"} step ${stepIndex}${branchLabel ? ` (${branchLabel})` : ""}: reinforce brand value and move subscribers toward conversion.`,
    discountCode: includeDiscount
      ? { included: true, description: "Include an incentive to drive urgency" }
      : { included: false },
    messagingFocus: focus,
    smartSending: stepIndex > 1,
    utmLinks: true,
    filterConditions: "NA" as string,
    implementationNotes: stepIndex === 1
      ? "First touch in this sequence. Set appropriate send timing."
      : `Step ${stepIndex} of ${totalSteps}. Ensure proper delay from previous message.`,
    strategy: strategyEntry
      ? {
          primaryFocus: isFirstInBranch
            ? strategyEntry.primary
            : `Step ${stepIndex}: Continue building on the ${flowName.toLowerCase()} strategy through ${focus.toLowerCase()}.`,
          secondaryFocus: isFirstInBranch
            ? strategyEntry.secondary
            : `Leverage previous touchpoints to ${includeDiscount ? "drive urgency and conversion" : "deepen engagement and trust"}.`
        }
      : undefined
  };
}

/**
 * Build an interleaved sequence of email + SMS messages as a single lane.
 * Pattern: emails first, then SMS — e.g. E1 → E2 → S1 → E3 → S2
 */
function buildInterleavedSequence(emailCount: number, smsCount: number): Array<"email" | "sms"> {
  const seq: Array<"email" | "sms"> = [];
  let ei = 0;
  let si = 0;
  const total = emailCount + smsCount;

  for (let i = 0; i < total; i++) {
    if (ei < emailCount && (si >= smsCount || ei / emailCount <= si / smsCount)) {
      seq.push("email");
      ei++;
    } else {
      seq.push("sms");
      si++;
    }
  }
  return seq;
}

/* ── Linear flow builder ── */

function createLinearFlow(blueprint: LinearFlowBlueprint, delay: DelayConfig): FlowSpec {
  const flowId = blueprint.id;
  const hasEmail = blueprint.emailCount > 0;
  const hasSms = blueprint.smsCount > 0;
  const channels: FlowSpec["channels"] = [
    ...(hasEmail ? (["email"] as const) : []),
    ...(hasSms ? (["sms"] as const) : [])
  ];

  const nodes: FlowSpec["nodes"] = [
    { id: `${flowId}_trigger`, type: "trigger", title: "Trigger", event: blueprint.triggerEvent }
  ];
  const edges: FlowSpec["edges"] = [];

  const sequence = buildInterleavedSequence(blueprint.emailCount, blueprint.smsCount);
  const totalSteps = sequence.length;
  let previousId = `${flowId}_trigger`;

  for (let i = 0; i < sequence.length; i++) {
    const channel = sequence[i];
    const stepIndex = i + 1;
    const messageId = `${flowId}_msg_${stepIndex}`;
    const content = getMessageContent(stepIndex, totalSteps, channel, blueprint.name, i === 0);

    nodes.push({
      id: messageId,
      type: "message",
      channel,
      title: getMessageTitle(blueprint.name, stepIndex, channel),
      stepIndex,
      copyHint: content.copyHint,
      discountCode: content.discountCode,
      messagingFocus: content.messagingFocus,
      smartSending: content.smartSending,
      utmLinks: content.utmLinks,
      filterConditions: content.filterConditions,
      implementationNotes: content.implementationNotes,
      ...(content.strategy ? { strategy: content.strategy } : {})
    });
    edges.push({ id: `${flowId}_e_${previousId}_to_${messageId}`, from: previousId, to: messageId });
    previousId = messageId;

    if (i < sequence.length - 1) {
      const waitId = `${flowId}_wait_${stepIndex}`;
      nodes.push({ id: waitId, type: "wait", duration: delay });
      edges.push({ id: `${flowId}_e_${previousId}_to_${waitId}`, from: previousId, to: waitId });
      previousId = waitId;
    }
  }

  const outcomeId = `${flowId}_outcome`;
  nodes.push({ id: outcomeId, type: "outcome", title: "End", result: "Flow completed" });
  edges.push({ id: `${flowId}_e_${previousId}_to_${outcomeId}`, from: previousId, to: outcomeId });

  return parseFlowSpec({
    id: flowId,
    name: blueprint.name,
    source: { mode: "template", templateKey: "core-foundation" },
    channels,
    defaults: { delay },
    nodes,
    edges
  });
}

/* ── Branch builder (single interleaved lane per branch) ── */

function buildBranch(
  nodes: FlowSpec["nodes"],
  edges: FlowSpec["edges"],
  flowId: string,
  splitId: string,
  delay: DelayConfig,
  branchKey: SegmentKey,
  branchLabel: string,
  counts: FlowCounts,
  flowName: string
): string {
  const sequence = buildInterleavedSequence(counts.email, counts.sms);
  if (sequence.length === 0) return splitId;

  const totalSteps = sequence.length;
  let previousId = splitId;

  for (let i = 0; i < sequence.length; i++) {
    const channel = sequence[i];
    const stepIndex = i + 1;
    const messageId = `${flowId}_${branchKey}_msg_${stepIndex}`;
    const content = getMessageContent(stepIndex, totalSteps, channel, flowName, i === 0, branchLabel);

    nodes.push({
      id: messageId,
      type: "message",
      channel,
      title: getMessageTitle(flowName, stepIndex, channel, branchLabel),
      stepIndex,
      copyHint: content.copyHint,
      discountCode: content.discountCode,
      messagingFocus: content.messagingFocus,
      smartSending: content.smartSending,
      utmLinks: content.utmLinks,
      filterConditions: content.filterConditions,
      implementationNotes: content.implementationNotes,
      ...(content.strategy ? { strategy: content.strategy } : {})
    });
    edges.push({
      id: `${flowId}_e_${previousId}_to_${messageId}`,
      from: previousId,
      to: messageId,
      label: previousId === splitId ? branchLabel : undefined
    });
    previousId = messageId;

    if (i < sequence.length - 1) {
      const waitId = `${flowId}_${branchKey}_wait_${stepIndex}`;
      nodes.push({ id: waitId, type: "wait", duration: delay });
      edges.push({ id: `${flowId}_e_${previousId}_to_${waitId}`, from: previousId, to: waitId });
      previousId = waitId;
    }
  }

  return previousId;
}

/* ── Split flow builder ── */

function createSplitFlow(blueprint: SplitFlowBlueprint, delay: DelayConfig): FlowSpec {
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
    { id: triggerId, type: "trigger", title: "Trigger", event: blueprint.triggerEvent },
    {
      id: splitId,
      type: "split",
      title: "Conditional Split",
      condition: blueprint.splitCondition,
      labels: { yes: yesLabel, no: noLabel }
    }
  ];
  const edges: FlowSpec["edges"] = [
    { id: `${flowId}_e_trigger_to_split`, from: triggerId, to: splitId }
  ];

  const yesEnd = buildBranch(nodes, edges, flowId, splitId, delay, "yes", yesLabel, blueprint.yesCounts, blueprint.name);
  const noEnd = buildBranch(nodes, edges, flowId, splitId, delay, "no", noLabel, blueprint.noCounts, blueprint.name);

  const yesOutcomeId = `${flowId}_outcome_yes`;
  const noOutcomeId = `${flowId}_outcome_no`;
  nodes.push({ id: yesOutcomeId, type: "outcome", title: "End", result: `${yesLabel} path completed` });
  nodes.push({ id: noOutcomeId, type: "outcome", title: "End", result: `${noLabel} path completed` });
  edges.push({ id: `${flowId}_e_${yesEnd}_to_${yesOutcomeId}`, from: yesEnd, to: yesOutcomeId });
  edges.push({ id: `${flowId}_e_${noEnd}_to_${noOutcomeId}`, from: noEnd, to: noOutcomeId });

  return parseFlowSpec({
    id: flowId,
    name: blueprint.name,
    source: { mode: "template", templateKey: "core-foundation" },
    channels,
    defaults: { delay },
    nodes,
    edges
  });
}

/* ── Mirror flow helper ── */

function mirrorFlow(base: FlowSpec, id: string, name: string, triggerEvent: string): FlowSpec {
  const nodeMap = new Map<string, string>();
  const mappedNodes = base.nodes.map((node) => {
    const mappedId = node.id.replace(new RegExp(`^${base.id}`), id);
    nodeMap.set(node.id, mappedId);
    if (node.type === "trigger") {
      return { ...node, id: mappedId, event: triggerEvent };
    }
    return { ...node, id: mappedId };
  });

  const mappedEdges = base.edges.map((edge) => ({
    ...edge,
    id: edge.id.replace(new RegExp(`^${base.id}`), id),
    from: nodeMap.get(edge.from) ?? edge.from,
    to: nodeMap.get(edge.to) ?? edge.to
  }));

  return parseFlowSpec({ ...base, id, name, nodes: mappedNodes, edges: mappedEdges });
}

function attachTemplateKey(flows: FlowSpec[], templateKey: PackageTemplateKey): FlowSpec[] {
  return flows.map((flow) =>
    parseFlowSpec({ ...flow, source: { mode: "template", templateKey } })
  );
}

/* ── Plan builders ── */

function buildCoreFoundation(options?: ExpandTemplateOptions): ExpandedPackage {
  const delay = withDelay(options);

  const emailWelcome = createLinearFlow(
    { id: "core_email_welcome", name: "Email Welcome", triggerEvent: "When someone subscribes to the email list", emailCount: 3, smsCount: 0 },
    delay
  );
  const smsWelcome = createLinearFlow(
    { id: "core_sms_welcome", name: "SMS Welcome", triggerEvent: "When someone opts in to SMS updates", emailCount: 0, smsCount: 2 },
    delay
  );
  const checkoutAbandonment = createLinearFlow(
    { id: "core_checkout_abandonment", name: "Checkout Abandonment", triggerEvent: "When someone starts checkout but does not complete purchase", emailCount: 2, smsCount: 2 },
    delay
  );
  const cartAbandonment = mirrorFlow(
    checkoutAbandonment,
    "core_cart_abandonment",
    "Cart Abandonment",
    "When someone adds to cart but does not purchase"
  );
  const browseAbandonment = createLinearFlow(
    { id: "core_browse_abandonment", name: "Browse Abandonment", triggerEvent: "When someone views products but does not add to cart", emailCount: 2, smsCount: 2 },
    delay
  );
  const postPurchase = createLinearFlow(
    { id: "core_post_purchase", name: "Post-Purchase", triggerEvent: "When someone places an order", emailCount: 1, smsCount: 1 },
    delay
  );

  const flows = attachTemplateKey(
    [emailWelcome, smsWelcome, checkoutAbandonment, cartAbandonment, browseAbandonment, postPurchase],
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

  const emailWelcome = createSplitFlow(
    { id: "growth_email_welcome", name: "Email Welcome", triggerEvent: "When someone subscribes to the email list", splitCondition: "Has placed an order?", yesCounts: { email: 1, sms: 0 }, noCounts: { email: 3, sms: 0 } },
    delay
  );
  const smsWelcome = createSplitFlow(
    { id: "growth_sms_welcome", name: "SMS Welcome", triggerEvent: "When someone opts in to SMS updates", splitCondition: "Has placed an order?", yesCounts: { email: 0, sms: 1 }, noCounts: { email: 0, sms: 2 } },
    delay
  );
  const checkoutAbandonment = createSplitFlow(
    { id: "growth_checkout_abandonment", name: "Checkout Abandonment", triggerEvent: "When someone starts checkout but does not complete purchase", splitCondition: "Has purchase history?", yesCounts: { email: 3, sms: 2 }, noCounts: { email: 3, sms: 2 } },
    delay
  );
  const cartAbandonment = mirrorFlow(
    checkoutAbandonment,
    "growth_cart_abandonment",
    "Cart Abandonment",
    "When someone adds to cart but does not purchase"
  );
  const browseAbandonment = createSplitFlow(
    { id: "growth_browse_abandonment", name: "Browse Abandonment", triggerEvent: "When someone browses products but does not add to cart", splitCondition: "Has purchase history?", yesCounts: { email: 3, sms: 2 }, noCounts: { email: 3, sms: 2 } },
    delay
  );
  const siteAbandonment = createLinearFlow(
    { id: "growth_site_abandonment", name: "Site Abandonment", triggerEvent: "When someone visits site and exits without product view", emailCount: 2, smsCount: 0 },
    delay
  );
  const postPurchase = createSplitFlow(
    { id: "growth_post_purchase", name: "Post-Purchase", triggerEvent: "When someone places an order", splitCondition: "Has purchase history?", yesCounts: { email: 2, sms: 1 }, noCounts: { email: 1, sms: 1 } },
    delay
  );
  const winback = createLinearFlow(
    { id: "growth_winback", name: "Winback", triggerEvent: "When customer is inactive for a defined window", emailCount: 2, smsCount: 0 },
    delay
  );

  const flows = attachTemplateKey(
    [emailWelcome, smsWelcome, checkoutAbandonment, cartAbandonment, browseAbandonment, siteAbandonment, postPurchase, winback],
    "growth-engine"
  );

  return {
    templateKey: "growth-engine",
    flows,
    mirrors: [{ flowId: "growth_cart_abandonment", mirrorsFlowId: "growth_checkout_abandonment" }]
  };
}

function buildFullSystem(options?: ExpandTemplateOptions): ExpandedPackage {
  const delay = withDelay(options);

  const emailWelcome = createSplitFlow(
    { id: "full_email_welcome", name: "Email Welcome", triggerEvent: "When someone subscribes to the email list", splitCondition: "Has placed an order?", yesCounts: { email: 2, sms: 0 }, noCounts: { email: 4, sms: 0 } },
    delay
  );
  const smsWelcome = createSplitFlow(
    { id: "full_sms_welcome", name: "SMS Welcome", triggerEvent: "When someone opts in to SMS updates", splitCondition: "Has placed an order?", yesCounts: { email: 0, sms: 1 }, noCounts: { email: 0, sms: 3 } },
    delay
  );
  const checkoutAbandonment = createSplitFlow(
    { id: "full_checkout_abandonment", name: "Checkout Abandonment", triggerEvent: "When someone starts checkout but does not complete purchase", splitCondition: "Has purchase history?", yesCounts: { email: 4, sms: 2 }, noCounts: { email: 4, sms: 2 } },
    delay
  );
  const cartAbandonment = mirrorFlow(
    checkoutAbandonment,
    "full_cart_abandonment",
    "Cart Abandonment",
    "When someone adds to cart but does not purchase"
  );
  const browseAbandonment = createSplitFlow(
    { id: "full_browse_abandonment", name: "Browse Abandonment", triggerEvent: "When someone browses products but does not add to cart", splitCondition: "Has purchase history?", yesCounts: { email: 4, sms: 2 }, noCounts: { email: 4, sms: 2 } },
    delay
  );
  const siteAbandonment = createLinearFlow(
    { id: "full_site_abandonment", name: "Site Abandonment", triggerEvent: "When someone visits site and exits without product view", emailCount: 3, smsCount: 0 },
    delay
  );
  const postPurchase = createSplitFlow(
    { id: "full_post_purchase", name: "Post-Purchase", triggerEvent: "When someone places an order", splitCondition: "Has purchase history?", yesCounts: { email: 3, sms: 2 }, noCounts: { email: 3, sms: 1 } },
    delay
  );
  const winback = createSplitFlow(
    { id: "full_winback", name: "Winback", triggerEvent: "When customer is inactive for a defined window", splitCondition: "Has purchase history?", yesCounts: { email: 3, sms: 0 }, noCounts: { email: 3, sms: 0 } },
    delay
  );
  const sunset = createLinearFlow(
    { id: "full_sunset", name: "Sunset", triggerEvent: "When subscriber remains inactive after winback", emailCount: 3, smsCount: 0 },
    delay
  );

  const flows = attachTemplateKey(
    [emailWelcome, smsWelcome, checkoutAbandonment, cartAbandonment, browseAbandonment, siteAbandonment, postPurchase, winback, sunset],
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
  if (templateKey === "core-foundation") return buildCoreFoundation(options);
  if (templateKey === "growth-engine") return buildGrowthEngine(options);
  return buildFullSystem(options);
}
