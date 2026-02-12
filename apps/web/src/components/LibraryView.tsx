import { useCallback, useEffect, useState } from "react";
import { FLOW_TYPE_LABELS, type FlowTemplate, type FlowType } from "@flow/core";
import { API_BASE } from "../constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

type TemplatesByType = Partial<Record<FlowType, FlowTemplate[]>>;

const FLOW_TYPES = Object.keys(FLOW_TYPE_LABELS).filter((k) => k !== "custom") as FlowType[];

const EMPTY_FORM: Omit<FlowTemplate, "id" | "createdAt" | "updatedAt" | "isDefault"> = {
  flowType: "email-welcome",
  name: "",
  description: "",
  triggerEvent: "",
  emailCount: 0,
  smsCount: 0,
  hasSplit: false,
};

export { FLOW_TYPES };

interface LibraryViewProps {
  activeType: FlowType;
}

export function LibraryView({ activeType }: LibraryViewProps) {
  const [templates, setTemplates] = useState<TemplatesByType>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FlowTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/library`);
      if (!res.ok) throw new Error("Failed to fetch library");
      setTemplates(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const currentTemplates = templates[activeType] ?? [];

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, flowType: activeType });
    setError("");
    setDialogOpen(true);
  }

  function openEdit(tpl: FlowTemplate) {
    setEditing(tpl);
    setForm({
      flowType: tpl.flowType,
      name: tpl.name,
      description: tpl.description,
      triggerEvent: tpl.triggerEvent,
      emailCount: tpl.emailCount,
      smsCount: tpl.smsCount,
      hasSplit: tpl.hasSplit,
      splitCondition: tpl.splitCondition,
      splitSegments: tpl.splitSegments,
    });
    setError("");
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setError("");
  }

  async function handleSave() {
    if (!form.name.trim() || !form.triggerEvent.trim()) {
      setError("Name and trigger event are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing) {
        const res = await fetch(`${API_BASE}/api/library/${editing.flowType}/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("Update failed");
      } else {
        const res = await fetch(`${API_BASE}/api/library/${form.flowType}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("Create failed");
      }
      await fetchTemplates();
      closeDialog();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(tpl: FlowTemplate) {
    if (!confirm(`Delete "${tpl.name}"?`)) return;
    try {
      await fetch(`${API_BASE}/api/library/${tpl.flowType}/${tpl.id}`, { method: "DELETE" });
      await fetchTemplates();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function updateForm(partial: Partial<typeof form>) {
    setForm((prev) => {
      const next = { ...prev, ...partial };
      if (!next.hasSplit) {
        delete next.splitCondition;
        delete next.splitSegments;
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading library...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-semibold text-foreground">{FLOW_TYPE_LABELS[activeType]}</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Template
        </Button>
      </div>

      {currentTemplates.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-6">
          No templates yet for this flow type. Click <b>+ New Template</b> to create one.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {currentTemplates.map((tpl) => (
            <div key={tpl.id} className="bg-white border border-border rounded-xl p-4 hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-foreground leading-snug">{tpl.name}</h4>
                {tpl.isDefault && <Badge variant="secondary" className="text-[10px] shrink-0">Default</Badge>}
              </div>
              {tpl.description && <p className="text-xs text-muted-foreground mb-2">{tpl.description}</p>}
              <div className="flex gap-1.5 mb-2">
                {tpl.emailCount > 0 && (
                  <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{tpl.emailCount}E</span>
                )}
                {tpl.smsCount > 0 && (
                  <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{tpl.smsCount}S</span>
                )}
                {tpl.hasSplit && (
                  <span className="text-[11px] font-bold bg-orange-50 text-orange-600 px-2 py-0.5 rounded">Split</span>
                )}
              </div>
              {tpl.hasSplit && tpl.splitCondition && (
                <p className="text-[11px] text-muted-foreground italic mb-2">{tpl.splitCondition}</p>
              )}
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEdit(tpl)}>
                  <Pencil className="w-3 h-3 mr-1" />
                  Edit
                </Button>
                {!tpl.isDefault && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(tpl)}>
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* create/edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Template" : "New Template"}</DialogTitle>
            <DialogDescription>
              {editing ? `Update the ${FLOW_TYPE_LABELS[editing.flowType]} template.` : `Create a new ${FLOW_TYPE_LABELS[activeType]} template.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input id="tpl-name" value={form.name} onChange={(e) => updateForm({ name: e.target.value })} placeholder="e.g. Welcome — 5 emails with split" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-desc">Description</Label>
              <Input id="tpl-desc" value={form.description} onChange={(e) => updateForm({ description: e.target.value })} placeholder="Optional short description" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-trigger">Trigger event</Label>
              <Input id="tpl-trigger" value={form.triggerEvent} onChange={(e) => updateForm({ triggerEvent: e.target.value })} placeholder="e.g. When someone subscribes to email" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-emails">Emails</Label>
                <Input id="tpl-emails" type="number" min={0} value={form.emailCount} onChange={(e) => updateForm({ emailCount: +e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-sms">SMS</Label>
                <Input id="tpl-sms" type="number" min={0} value={form.smsCount} onChange={(e) => updateForm({ smsCount: +e.target.value })} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="tpl-split"
                checked={form.hasSplit}
                onCheckedChange={(checked) => updateForm({ hasSplit: !!checked })}
              />
              <Label htmlFor="tpl-split" className="cursor-pointer">Has conditional split</Label>
            </div>

            {form.hasSplit && (
              <div className="border border-border rounded-lg p-3 flex flex-col gap-3 bg-slate-50">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tpl-split-cond">Split condition</Label>
                  <Input id="tpl-split-cond" value={form.splitCondition ?? ""} onChange={(e) => updateForm({ splitCondition: e.target.value })} placeholder="e.g. Has placed order" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">Yes branch</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Emails</Label>
                      <Input type="number" min={0} className="h-8"
                        value={form.splitSegments?.yes.email ?? 0}
                        onChange={(e) => updateForm({ splitSegments: { yes: { email: +e.target.value, sms: form.splitSegments?.yes.sms ?? 0 }, no: form.splitSegments?.no ?? { email: 0, sms: 0 } } })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">SMS</Label>
                      <Input type="number" min={0} className="h-8"
                        value={form.splitSegments?.yes.sms ?? 0}
                        onChange={(e) => updateForm({ splitSegments: { yes: { email: form.splitSegments?.yes.email ?? 0, sms: +e.target.value }, no: form.splitSegments?.no ?? { email: 0, sms: 0 } } })}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">No branch</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Emails</Label>
                      <Input type="number" min={0} className="h-8"
                        value={form.splitSegments?.no.email ?? 0}
                        onChange={(e) => updateForm({ splitSegments: { yes: form.splitSegments?.yes ?? { email: 0, sms: 0 }, no: { email: +e.target.value, sms: form.splitSegments?.no.sms ?? 0 } } })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">SMS</Label>
                      <Input type="number" min={0} className="h-8"
                        value={form.splitSegments?.no.sms ?? 0}
                        onChange={(e) => updateForm({ splitSegments: { yes: form.splitSegments?.yes ?? { email: 0, sms: 0 }, no: { email: form.splitSegments?.no.email ?? 0, sms: +e.target.value } } })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy ? "Saving..." : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
