import type { FlowSpec } from "../schema/flowSpec.js";

export const welcomeSeriesFixture: FlowSpec = {
  id: "welcome-series-email-5",
  name: "Welcome Series",
  source: {
    mode: "manual"
  },
  channels: ["email"],
  defaults: {
    delay: {
      value: 2,
      unit: "days"
    }
  },
  nodes: [
    {
      id: "trigger_signup",
      type: "trigger",
      title: "Trigger",
      event: "Triggered when a user signs up for updates from your brand."
    },
    {
      id: "note_objective",
      type: "note",
      title: "OBJECTIVE/FOCUS",
      body: "Establish a welcoming tone and introduce the brand's value in the first touch (Step 1)."
    },
    {
      id: "email_1",
      type: "message",
      channel: "email",
      title: "Welcome!",
      stepIndex: 1,
      copyHint: "Thank the user for signing up and introduce them to your brand community.",
      discountCode: { included: false },
      messagingFocus: "Introduction & Engagement"
    },
    {
      id: "wait_1",
      type: "wait",
      duration: { value: 2, unit: "days" }
    },
    {
      id: "email_2",
      type: "message",
      channel: "email",
      title: "Your Journey Begins",
      stepIndex: 2,
      copyHint: "Encourage engagement with your services and highlight the value proposition.",
      discountCode: { included: false },
      messagingFocus: "Service Highlights & Value Proposition"
    },
    {
      id: "split_engaged",
      type: "split",
      title: "Conditional Split",
      condition: "User has engaged with Email 2 (purchaser vs non-purchaser)",
      labels: {
        yes: "Yes",
        no: "No"
      }
    },
    {
      id: "strategy_yes",
      type: "strategy",
      title: "STRATEGY",
      primaryFocus: "Thank existing customers and reinforce brand loyalty. Highlight exclusive benefits.",
      secondaryFocus: "Drive referrals and upsells through personalized recommendations.",
      branchLabel: "yes"
    },
    {
      id: "strategy_no",
      type: "strategy",
      title: "STRATEGY",
      primaryFocus: "Set a welcoming tone and build initial trust with new subscribers.",
      secondaryFocus: "Encourage engagement and highlight the value proposition in later steps.",
      branchLabel: "no"
    },
    {
      id: "email_3_engaged",
      type: "message",
      channel: "email",
      title: "Welcome to the Community!",
      stepIndex: 3,
      copyHint: "Thank the user for their purchase and introduce them to your brand community.",
      discountCode: { included: true, description: "Include a discount to drive urgency" },
      messagingFocus: "Introduction & Engagement"
    },
    {
      id: "email_3_non_engaged",
      type: "message",
      channel: "email",
      title: "We Miss You!",
      stepIndex: 3,
      copyHint: "Re-engage non-purchasers with a compelling offer or reminder.",
      discountCode: { included: true, description: "Include a discount to drive urgency" },
      messagingFocus: "Re-engagement & Conversion"
    },
    {
      id: "wait_2",
      type: "wait",
      duration: { value: 2, unit: "days" }
    },
    {
      id: "email_4",
      type: "message",
      channel: "email",
      title: "Exclusive Benefits",
      stepIndex: 4,
      copyHint: "Share exclusive perks and invite subscribers to explore more.",
      discountCode: { included: false },
      messagingFocus: "Service Highlights & Value Proposition"
    },
    {
      id: "wait_3",
      type: "wait",
      duration: { value: 2, unit: "days" }
    },
    {
      id: "email_5",
      type: "message",
      channel: "email",
      title: "Last Chance to Get Started",
      stepIndex: 5,
      copyHint: "Final urgency message with clear call-to-action.",
      discountCode: { included: true, description: "Include a discount to drive urgency" },
      messagingFocus: "Final Urgency, Stock & Scarcity"
    },
    {
      id: "outcome_engaged",
      type: "outcome",
      title: "Yes Path Complete",
      result: "Purchaser path completed"
    },
    {
      id: "outcome_non_engaged",
      type: "outcome",
      title: "No Path Complete",
      result: "Non-purchaser path completed"
    }
  ],
  edges: [
    { id: "e1", from: "trigger_signup", to: "email_1" },
    { id: "e_note", from: "note_objective", to: "email_1" },
    { id: "e2", from: "email_1", to: "wait_1" },
    { id: "e3", from: "wait_1", to: "email_2" },
    { id: "e4", from: "email_2", to: "split_engaged" },
    { id: "e5_yes", from: "split_engaged", to: "email_3_engaged", label: "Yes" },
    { id: "e6_no", from: "split_engaged", to: "email_3_non_engaged", label: "No" },
    { id: "e_strat_yes", from: "strategy_yes", to: "email_3_engaged" },
    { id: "e_strat_no", from: "strategy_no", to: "email_3_non_engaged" },
    { id: "e7", from: "email_3_engaged", to: "wait_2" },
    { id: "e8", from: "email_3_non_engaged", to: "wait_2" },
    { id: "e9", from: "wait_2", to: "email_4" },
    { id: "e10", from: "email_4", to: "wait_3" },
    { id: "e11", from: "wait_3", to: "email_5" },
    { id: "e12", from: "email_5", to: "outcome_engaged", label: "Yes" },
    { id: "e13", from: "email_5", to: "outcome_non_engaged", label: "No" }
  ]
};
