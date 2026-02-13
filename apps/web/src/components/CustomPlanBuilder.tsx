import { useCallback, useEffect, useState } from "react";
import { FLOW_TYPE_LABELS, type FlowTemplate, type FlowType } from "@flow/core";
import { API_BASE } from "../constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";

type TemplatesByType = Partial<Record<FlowType, FlowTemplate[]>>;
type Selection = Partial<Record<FlowType, string>>;

const FLOW_TYPES = Object.keys(FLOW_TYPE_LABELS).filter((k) => k !== "custom") as FlowType[];

interface Props {
  disabled?: boolean;
  onSelectionChange: (templateIds: string[]) => void;
}

export function CustomPlanBuilder({ disabled, onSelectionChange }: Props) {
  const [open, setOpen] = useState(false);
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

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="justify-start"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        {selectedCount > 0 ? (
          <>
            <Check className="w-4 h-4 mr-1.5 text-green-600" />
            <span className="text-green-700">{selectedCount} flow{selectedCount !== 1 ? "s" : ""} selected</span>
          </>
        ) : (
          "Choose templates..."
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Select Flow Templates</DialogTitle>
            <DialogDescription>
              Pick one template per flow type to include in your custom plan. Skip any you don't need.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading templates...</p>
          ) : (
            <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-1">
              {FLOW_TYPES.map((ft) => {
                const options = templates[ft] ?? [];
                if (options.length === 0) return null;
                const isSelected = !!selection[ft];
                return (
                  <div
                    key={ft}
                    className={`rounded-lg border p-3 transition-colors ${
                      isSelected ? "border-blue-400 bg-blue-50/50" : "border-gray-200"
                    }`}
                  >
                    <Label className="text-sm font-semibold mb-1.5 block">{FLOW_TYPE_LABELS[ft]}</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={selection[ft] ?? ""}
                      onChange={(e) => handleSelect(ft, e.target.value)}
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
          )}

          <DialogFooter>
            <Button onClick={() => setOpen(false)}>
              Done ({selectedCount} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
