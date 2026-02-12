import { useCallback, useEffect, useState } from "react";
import { FLOW_TYPE_LABELS, type FlowTemplate, type FlowType } from "@flow/core";
import { API_BASE } from "../constants";

type TemplatesByType = Partial<Record<FlowType, FlowTemplate[]>>;
type Selection = Partial<Record<FlowType, string>>;

const FLOW_TYPES = Object.keys(FLOW_TYPE_LABELS).filter((k) => k !== "custom") as FlowType[];

interface Props {
  disabled?: boolean;
  onSelectionChange: (templateIds: string[]) => void;
}

export function CustomPlanBuilder({ disabled, onSelectionChange }: Props) {
  const [templates, setTemplates] = useState<TemplatesByType>({});
  const [selection, setSelection] = useState<Selection>({});
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/library`);
      if (!res.ok) return;
      setTemplates(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    const ids = Object.values(selection).filter(Boolean) as string[];
    onSelectionChange(ids);
  }, [selection, onSelectionChange]);

  function handleSelect(flowType: FlowType, templateId: string) {
    setSelection((prev) => {
      const next = { ...prev };
      if (templateId === "") {
        delete next[flowType];
      } else {
        next[flowType] = templateId;
      }
      return next;
    });
  }

  const selectedCount = Object.values(selection).filter(Boolean).length;

  if (loading) return <small className="hint">Loading templates...</small>;

  return (
    <div className="custom-plan-builder">
      <small className="hint">{selectedCount} flow{selectedCount !== 1 ? "s" : ""} selected</small>
      {FLOW_TYPES.map((ft) => {
        const options = templates[ft] ?? [];
        if (options.length === 0) return null;
        return (
          <div key={ft} className="cpb-row">
            <label>{FLOW_TYPE_LABELS[ft]}</label>
            <select
              value={selection[ft] ?? ""}
              onChange={(e) => handleSelect(ft, e.target.value)}
              disabled={disabled}
            >
              <option value="">— Skip —</option>
              {options.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.emailCount}E/{tpl.smsCount}S{tpl.hasSplit ? ", split" : ""})
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
