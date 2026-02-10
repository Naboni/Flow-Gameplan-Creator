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
      event: "When user is added to newsletter list"
    },
    {
      id: "email_1",
      type: "message",
      channel: "email",
      title: "Email 1",
      stepIndex: 1
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
      title: "Email 2",
      stepIndex: 2
    },
    {
      id: "split_engaged",
      type: "split",
      title: "Conditional Split",
      condition: "Has engaged with Email 2",
      labels: {
        yes: "Yes",
        no: "No"
      }
    },
    {
      id: "email_3_engaged",
      type: "message",
      channel: "email",
      title: "Email 3 (Engaged)",
      stepIndex: 3
    },
    {
      id: "email_3_non_engaged",
      type: "message",
      channel: "email",
      title: "Email 3 (Non-Engaged)",
      stepIndex: 3
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
      title: "Email 4",
      stepIndex: 4
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
      title: "Email 5",
      stepIndex: 5
    },
    {
      id: "outcome_engaged",
      type: "outcome",
      title: "Outcome",
      result: "Engaged path completed"
    },
    {
      id: "outcome_non_engaged",
      type: "outcome",
      title: "Outcome",
      result: "Non-engaged path completed"
    }
  ],
  edges: [
    { id: "e1", from: "trigger_signup", to: "email_1" },
    { id: "e2", from: "email_1", to: "wait_1" },
    { id: "e3", from: "wait_1", to: "email_2" },
    { id: "e4", from: "email_2", to: "split_engaged" },
    { id: "e5_yes", from: "split_engaged", to: "email_3_engaged", label: "Yes" },
    { id: "e6_no", from: "split_engaged", to: "email_3_non_engaged", label: "No" },
    { id: "e7", from: "email_3_engaged", to: "wait_2" },
    { id: "e8", from: "email_3_non_engaged", to: "wait_2" },
    { id: "e9", from: "wait_2", to: "email_4" },
    { id: "e10", from: "email_4", to: "wait_3" },
    { id: "e11", from: "wait_3", to: "email_5" },
    { id: "e12", from: "email_5", to: "outcome_engaged", label: "Yes" },
    { id: "e13", from: "email_5", to: "outcome_non_engaged", label: "No" }
  ]
};
