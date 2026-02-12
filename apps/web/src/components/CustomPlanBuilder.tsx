import { useCallback, useEffect, useState } from "react";
import { FLOW_TYPE_LABELS, type FlowTemplate, type FlowType } from "@flow/core";
import { API_BASE } from "../constants";
import { Label } from "@/components/ui/label";

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

  if (loading) return <p className="text-xs text-muted-foreground">Loading templates...</p>;

  return (
    <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto">
      <p className="text-xs text-muted-foreground">{selectedCount} flow{selectedCount !== 1 ? "s" : ""} selected</p>
      {FLOW_TYPES.map((ft) => {
        const options = templates[ft] ?? [];
        if (options.length === 0) return null;
        return (
          <div key={ft} className="flex flex-col gap-1">
            <Label className="text-xs">{FLOW_TYPE_LABELS[ft]}</Label>
            <select
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
