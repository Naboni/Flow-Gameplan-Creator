export function asPositiveInt(value: unknown, fallback = 1): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.round(Math.abs(n)));
}

export function normalizeFlowSpecCandidate(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const spec = structuredClone(input) as Record<string, unknown>;

  if (spec.defaults && typeof spec.defaults === "object") {
    const defaults = spec.defaults as Record<string, unknown>;
    if (defaults.delay && typeof defaults.delay === "object") {
      const delay = defaults.delay as Record<string, unknown>;
      delay.value = asPositiveInt(delay.value, 2);
      if (
        typeof delay.unit !== "string" ||
        !["minutes", "hours", "days"].includes(delay.unit)
      ) {
        delay.unit = "days";
      }
      defaults.delay = delay;
    }
    spec.defaults = defaults;
  }

  if (Array.isArray(spec.nodes)) {
    spec.nodes = spec.nodes.map((node) => {
      if (!node || typeof node !== "object") return node;
      const n = node as Record<string, unknown>;

      if (n.type === "wait") {
        const duration =
          n.duration && typeof n.duration === "object"
            ? (n.duration as Record<string, unknown>)
            : {};
        duration.value = asPositiveInt(duration.value, 1);
        if (
          typeof duration.unit !== "string" ||
          !["minutes", "hours", "days"].includes(duration.unit)
        ) {
          duration.unit = "days";
        }
        n.duration = duration;
      }

      if (n.type === "split") {
        if (Array.isArray(n.labels)) {
          const labels = n.labels.filter(
            (l) => typeof l === "string" && l.trim().length > 0
          ) as string[];
          n.labels = labels.length >= 2 ? labels : ["Yes", "No"];
        } else if (n.labels && typeof n.labels === "object") {
          const obj = n.labels as Record<string, unknown>;
          const yes =
            typeof obj.yes === "string" && obj.yes.trim() ? obj.yes : "Yes";
          const no =
            typeof obj.no === "string" && obj.no.trim() ? obj.no : "No";
          n.labels = [yes, no];
        } else {
          n.labels = ["Yes", "No"];
        }
      }

      return n;
    });
  }

  return spec;
}
