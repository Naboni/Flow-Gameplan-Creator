import { useCallback, useEffect, useState } from "react";
import { FLOW_TYPE_LABELS, type FlowTemplate, type FlowType } from "@flow/core";
import { API_BASE } from "../constants";

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

export function LibraryView() {
  const [templates, setTemplates] = useState<TemplatesByType>({});
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<FlowType>("email-welcome");
  const [editing, setEditing] = useState<FlowTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/library`);
      if (!res.ok) throw new Error("Failed to fetch library");
      const data = await res.json();
      setTemplates(data);
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
    setCreating(true);
    setError("");
  }

  function openEdit(tpl: FlowTemplate) {
    setCreating(false);
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
  }

  function closeForm() {
    setCreating(false);
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
      closeForm();
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
      if (editing?.id === tpl.id) closeForm();
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
    return <div className="library-loading">Loading library...</div>;
  }

  return (
    <div className="library-view">
      <aside className="library-types">
        <h3>Flow Types</h3>
        {FLOW_TYPES.map((ft) => {
          const count = templates[ft]?.length ?? 0;
          return (
            <button
              key={ft}
              type="button"
              className={`library-type-btn ${ft === activeType ? "active" : ""}`}
              onClick={() => { setActiveType(ft); closeForm(); }}
            >
              <span>{FLOW_TYPE_LABELS[ft]}</span>
              <span className="library-type-count">{count}</span>
            </button>
          );
        })}
      </aside>

      <div className="library-content">
        <div className="library-header">
          <h2>{FLOW_TYPE_LABELS[activeType]}</h2>
          <button type="button" className="library-add-btn" onClick={openCreate}>
            + New Template
          </button>
        </div>

        {error && <p className="library-error">{error}</p>}

        {(creating || editing) && (
          <div className="library-form">
            <h3>{editing ? "Edit Template" : "New Template"}</h3>
            <label>
              Name
              <input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} />
            </label>
            <label>
              Description
              <input value={form.description} onChange={(e) => updateForm({ description: e.target.value })} />
            </label>
            <label>
              Trigger event
              <input value={form.triggerEvent} onChange={(e) => updateForm({ triggerEvent: e.target.value })} />
            </label>
            <div className="library-form-row">
              <label>
                Emails
                <input type="number" min={0} value={form.emailCount} onChange={(e) => updateForm({ emailCount: +e.target.value })} />
              </label>
              <label>
                SMS
                <input type="number" min={0} value={form.smsCount} onChange={(e) => updateForm({ smsCount: +e.target.value })} />
              </label>
            </div>
            <label className="library-checkbox">
              <input type="checkbox" checked={form.hasSplit} onChange={(e) => updateForm({ hasSplit: e.target.checked })} />
              Has conditional split
            </label>
            {form.hasSplit && (
              <>
                <label>
                  Split condition
                  <input
                    value={form.splitCondition ?? ""}
                    onChange={(e) => updateForm({ splitCondition: e.target.value })}
                    placeholder="e.g. Has placed order"
                  />
                </label>
                <div className="library-form-segments">
                  <small className="library-segment-title">Yes branch</small>
                  <div className="library-form-row">
                    <label>
                      Emails
                      <input type="number" min={0}
                        value={form.splitSegments?.yes.email ?? 0}
                        onChange={(e) => updateForm({
                          splitSegments: {
                            yes: { email: +e.target.value, sms: form.splitSegments?.yes.sms ?? 0 },
                            no: form.splitSegments?.no ?? { email: 0, sms: 0 },
                          }
                        })}
                      />
                    </label>
                    <label>
                      SMS
                      <input type="number" min={0}
                        value={form.splitSegments?.yes.sms ?? 0}
                        onChange={(e) => updateForm({
                          splitSegments: {
                            yes: { email: form.splitSegments?.yes.email ?? 0, sms: +e.target.value },
                            no: form.splitSegments?.no ?? { email: 0, sms: 0 },
                          }
                        })}
                      />
                    </label>
                  </div>
                  <small className="library-segment-title">No branch</small>
                  <div className="library-form-row">
                    <label>
                      Emails
                      <input type="number" min={0}
                        value={form.splitSegments?.no.email ?? 0}
                        onChange={(e) => updateForm({
                          splitSegments: {
                            yes: form.splitSegments?.yes ?? { email: 0, sms: 0 },
                            no: { email: +e.target.value, sms: form.splitSegments?.no.sms ?? 0 },
                          }
                        })}
                      />
                    </label>
                    <label>
                      SMS
                      <input type="number" min={0}
                        value={form.splitSegments?.no.sms ?? 0}
                        onChange={(e) => updateForm({
                          splitSegments: {
                            yes: form.splitSegments?.yes ?? { email: 0, sms: 0 },
                            no: { email: form.splitSegments?.no.email ?? 0, sms: +e.target.value },
                          }
                        })}
                      />
                    </label>
                  </div>
                </div>
              </>
            )}
            <div className="library-form-actions">
              <button type="button" onClick={handleSave} disabled={busy}>
                {busy ? "Saving..." : editing ? "Update" : "Create"}
              </button>
              <button type="button" className="library-cancel-btn" onClick={closeForm}>Cancel</button>
            </div>
          </div>
        )}

        {currentTemplates.length === 0 && !creating ? (
          <p className="library-empty">No templates yet for this flow type. Click <b>+ New Template</b> to create one.</p>
        ) : (
          <div className="library-grid">
            {currentTemplates.map((tpl) => (
              <div key={tpl.id} className={`library-card ${editing?.id === tpl.id ? "active" : ""}`}>
                <div className="library-card-header">
                  <h4>{tpl.name}</h4>
                  {tpl.isDefault && <span className="library-badge">Default</span>}
                </div>
                {tpl.description && <p className="library-card-desc">{tpl.description}</p>}
                <div className="library-card-stats">
                  {tpl.emailCount > 0 && <span>{tpl.emailCount}E</span>}
                  {tpl.smsCount > 0 && <span>{tpl.smsCount}S</span>}
                  {tpl.hasSplit && <span className="library-split-badge">Split</span>}
                </div>
                {tpl.hasSplit && tpl.splitCondition && (
                  <p className="library-card-split">{tpl.splitCondition}</p>
                )}
                <div className="library-card-actions">
                  <button type="button" onClick={() => openEdit(tpl)}>Edit</button>
                  {!tpl.isDefault && (
                    <button type="button" className="danger" onClick={() => handleDelete(tpl)}>Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
