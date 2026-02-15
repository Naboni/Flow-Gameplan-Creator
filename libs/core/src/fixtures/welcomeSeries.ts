import type { FlowSpec } from "../schema/flowSpec.js";

export const welcomeSeriesFixture: FlowSpec = {
  id: "welcome-series-email-5",
  name: "Welcome Series",
  source: { mode: "manual" },
  channels: ["email", "sms"],
  defaults: { delay: { value: 2, unit: "days" } },
  nodes: [
    {
      id: "trigger_signup",
      type: "trigger",
      title: "Trigger",
      event: "When someone subscribes to the email list"
    },
    {
      id: "email_welcome",
      type: "message",
      channel: "email",
      title: "Welcome to the Brand!",
      stepIndex: 1,
      copyHint: "Thank the subscriber for joining. Introduce brand story and what to expect.",
      discountCode: { included: false },
      messagingFocus: "Introduction & Engagement",
      smartSending: false,
      utmLinks: true,
      filterConditions: "NA",
      implementationNotes: "Immediate send upon signup. Disable smart sending so every new subscriber receives this.",
      strategy: {
        primaryFocus: "Create a strong first impression and set expectations for the email series.",
        secondaryFocus: "Introduce the brand story and core values to build an emotional connection."
      }
    },
    {
      id: "wait_1",
      type: "wait",
      duration: { value: 1, unit: "days" }
    },
    {
      id: "email_brand_story",
      type: "message",
      channel: "email",
      title: "Our Story & What We Stand For",
      stepIndex: 2,
      copyHint: "Share the brand origin story, mission, and what makes the products unique.",
      discountCode: { included: false },
      messagingFocus: "Service Highlights & Value Proposition",
      smartSending: true,
      utmLinks: true,
      filterConditions: "NA",
      implementationNotes: "Highlight unique selling points. Link to an About Us or brand story page."
    },
    {
      id: "wait_2",
      type: "wait",
      duration: { value: 2, unit: "days" }
    },
    {
      id: "split_purchased",
      type: "split",
      title: "Conditional Split",
      condition: "Has placed an order?",
      labels: { yes: "Yes", no: "No" }
    },

    /* ── Yes branch (purchasers) ── */
    {
      id: "email_yes_thankyou",
      type: "message",
      channel: "email",
      title: "Thank You For Your Purchase",
      stepIndex: 3,
      copyHint: "Express gratitude for their order. Suggest complementary products.",
      discountCode: { included: false },
      messagingFocus: "Service Highlights & Value Proposition",
      smartSending: true,
      utmLinks: true,
      filterConditions: "NA",
      implementationNotes: "Reference their recent purchase. Include dynamic product recommendations.",
      strategy: {
        primaryFocus: "Reinforce the purchase decision and reduce buyer's remorse.",
        secondaryFocus: "Introduce cross-sell opportunities with related products."
      }
    },
    {
      id: "wait_yes_1",
      type: "wait",
      duration: { value: 2, unit: "days" }
    },
    {
      id: "sms_yes_referral",
      type: "message",
      channel: "sms",
      title: "Quick Reminder — Refer a Friend",
      stepIndex: 4,
      copyHint: "Short text nudge to refer a friend and earn a reward.",
      discountCode: { included: true, description: "Include a referral incentive for both parties" },
      messagingFocus: "Re-engagement & Conversion",
      smartSending: true,
      utmLinks: true,
      filterConditions: "NA",
      implementationNotes: "Keep it under 160 characters. Include a direct referral link."
    },
    {
      id: "outcome_yes",
      type: "outcome",
      title: "End",
      result: "Purchaser welcome path completed"
    },

    /* ── No branch (non-purchasers) ── */
    {
      id: "email_no_social_proof",
      type: "message",
      channel: "email",
      title: "Why Customers Love Us",
      stepIndex: 3,
      copyHint: "Showcase customer reviews, testimonials, and social proof.",
      discountCode: { included: false },
      messagingFocus: "Re-engagement & Conversion",
      smartSending: true,
      utmLinks: true,
      filterConditions: "NA",
      implementationNotes: "Feature real customer testimonials and star ratings.",
      strategy: {
        primaryFocus: "Build trust through social proof and overcome purchase hesitation.",
        secondaryFocus: "Showcase best-selling or most-reviewed products to guide first purchase."
      }
    },
    {
      id: "wait_no_1",
      type: "wait",
      duration: { value: 2, unit: "days" }
    },
    {
      id: "email_no_offer",
      type: "message",
      channel: "email",
      title: "An Exclusive Offer Just For You",
      stepIndex: 4,
      copyHint: "Offer a first-purchase incentive with a clear call-to-action.",
      discountCode: { included: true, description: "Include a first-purchase incentive to drive conversion" },
      messagingFocus: "Re-engagement & Conversion",
      smartSending: true,
      utmLinks: true,
      filterConditions: "NA",
      implementationNotes: "Time-limited offer. Include dynamic product block with bestsellers."
    },
    {
      id: "wait_no_2",
      type: "wait",
      duration: { value: 1, unit: "days" }
    },
    {
      id: "sms_no_urgency",
      type: "message",
      channel: "sms",
      title: "Last Chance — Offer Expires Today",
      stepIndex: 5,
      copyHint: "Short, urgent text reminder that the offer is expiring.",
      discountCode: { included: true, description: "Remind of the expiring first-purchase offer" },
      messagingFocus: "Final Urgency, Stock & Scarcity",
      smartSending: true,
      utmLinks: true,
      filterConditions: "Has not placed order since flow entry",
      implementationNotes: "SMS drives immediate action. Keep it concise with a direct shop link."
    },
    {
      id: "outcome_no",
      type: "outcome",
      title: "End",
      result: "Non-purchaser welcome path completed"
    }
  ],
  edges: [
    { id: "e1", from: "trigger_signup", to: "email_welcome" },
    { id: "e2", from: "email_welcome", to: "wait_1" },
    { id: "e3", from: "wait_1", to: "email_brand_story" },
    { id: "e4", from: "email_brand_story", to: "wait_2" },
    { id: "e5", from: "wait_2", to: "split_purchased" },
    /* Yes branch */
    { id: "e6_yes", from: "split_purchased", to: "email_yes_thankyou", label: "Yes" },
    { id: "e7", from: "email_yes_thankyou", to: "wait_yes_1" },
    { id: "e8", from: "wait_yes_1", to: "sms_yes_referral" },
    { id: "e9", from: "sms_yes_referral", to: "outcome_yes" },
    /* No branch */
    { id: "e6_no", from: "split_purchased", to: "email_no_social_proof", label: "No" },
    { id: "e10", from: "email_no_social_proof", to: "wait_no_1" },
    { id: "e11", from: "wait_no_1", to: "email_no_offer" },
    { id: "e12", from: "email_no_offer", to: "wait_no_2" },
    { id: "e13", from: "wait_no_2", to: "sms_no_urgency" },
    { id: "e14", from: "sms_no_urgency", to: "outcome_no" }
  ]
};
