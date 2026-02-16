import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { loadStoredNode, storeSavedNode, type StoredNodePayload } from "../utils/nodeStore";
import type { FlowNode, EmailContent, MessageStatus } from "@flow/core";

type MessageNode = Extract<FlowNode, { type: "message" }>;

type EditorTab = "content" | "overview" | "settings";

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const STATUS_OPTIONS: { value: MessageStatus; label: string; color: string }[] = [
  { value: "draft", label: "Draft", color: "bg-slate-400" },
  { value: "manual", label: "Manual", color: "bg-amber-500" },
  { value: "live", label: "Live", color: "bg-emerald-500" },
];

export function EmailEditorPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const [payload, setPayload] = useState<StoredNodePayload | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>("content");
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [emailName, setEmailName] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [status, setStatus] = useState<MessageStatus>("draft");

  // Strategy fields (read-only display)
  const [node, setNode] = useState<MessageNode | null>(null);

  useEffect(() => {
    const stored = loadStoredNode();
    if (stored && stored.nodeId === nodeId) {
      setPayload(stored);
      const msg = stored.flowNode as MessageNode;
      setNode(msg);
      setEmailName(msg.title || "");
      setSubjectLine(msg.emailContent?.subjectLine || msg.copyHint || "");
      setPreviewText(msg.emailContent?.previewText || "");
      setSenderName(msg.emailContent?.senderName || stored.brandName || "");
      setSenderEmail(msg.emailContent?.senderEmail || "");
      setReplyTo(msg.emailContent?.replyTo || "");
      setBodyHtml(msg.emailContent?.bodyHtml || "");
      setStatus(msg.status ?? "draft");
    }
  }, [nodeId]);

  const handleSave = useCallback(() => {
    if (!payload || !node) return;

    const updatedContent: EmailContent = {
      subjectLine,
      previewText,
      senderName,
      senderEmail,
      replyTo,
      bodyHtml,
    };

    const updatedNode: FlowNode = {
      ...node,
      title: emailName,
      status,
      emailContent: updatedContent,
    };

    storeSavedNode({
      nodeId: payload.nodeId,
      flowNode: updatedNode,
      timestamp: Date.now(),
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [payload, node, emailName, subjectLine, previewText, senderName, senderEmail, replyTo, bodyHtml, status]);

  if (!payload || !node) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-slate-700">No editor data found</h2>
          <p className="text-sm text-slate-500 mt-1">This window must be opened from the flow editor.</p>
        </div>
      </div>
    );
  }

  const brandName = payload.brandName || "Brand";
  const brandInitials = getInitials(brandName);
  const isEmail = node.channel === "email";
  const primaryColor = isEmail ? "#6495ED" : "#4CAF50";

  const tabs: { key: EditorTab; label: string }[] = [
    { key: "content", label: "Message Content" },
    { key: "overview", label: "Overview" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ background: primaryColor }}
          >
            {brandInitials}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-slate-800">{emailName || "Untitled Email"}</h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500 border border-slate-200 uppercase">
              {status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-emerald-600 font-medium animate-fade-in">
              ✓ Saved
            </span>
          )}
          <button
            onClick={handleSave}
            className="text-xs px-4 py-2 rounded-md text-white font-medium transition-colors"
            style={{ background: primaryColor }}
          >
            Save Changes
          </button>
          <button
            onClick={() => { handleSave(); window.close(); }}
            className="text-xs px-4 py-2 rounded-md bg-slate-800 text-white hover:bg-slate-700 transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-slate-800 text-slate-800"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === "content" && (
          <>
            {/* Left panel: form */}
            <div className="w-[420px] flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
              <div className="p-6 space-y-5">
                <SectionHeading>Email Details</SectionHeading>

                <FormField label="Name" hint="Internal name for this email">
                  <input
                    type="text"
                    value={emailName}
                    onChange={(e) => setEmailName(e.target.value)}
                    className="form-input"
                    placeholder="Welcome email (coupon)"
                  />
                </FormField>

                <FormField label="Subject line">
                  <input
                    type="text"
                    value={subjectLine}
                    onChange={(e) => setSubjectLine(e.target.value)}
                    className="form-input"
                    placeholder="Unlock your exclusive discount today"
                  />
                </FormField>

                <FormField label="Preview text">
                  <input
                    type="text"
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    className="form-input"
                    placeholder="Discover your special offer"
                  />
                </FormField>

                <div className="border-t border-slate-100 pt-5">
                  <SectionHeading>Sender Information</SectionHeading>
                </div>

                <FormField label="Sender name">
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    className="form-input"
                    placeholder={brandName}
                  />
                </FormField>

                <FormField label="Sender email address">
                  <input
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    className="form-input"
                    placeholder={`hello@${brandName.toLowerCase().replace(/\s+/g, "")}.com`}
                  />
                </FormField>

                <FormField label="Reply-to email" hint="Optional">
                  <input
                    type="email"
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    className="form-input"
                    placeholder="Same as sender"
                  />
                </FormField>

                <div className="border-t border-slate-100 pt-5">
                  <SectionHeading>Status</SectionHeading>
                </div>

                <div className="flex gap-2">
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setStatus(opt.value)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        status === opt.value
                          ? "border-slate-800 bg-slate-50 text-slate-800"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* A/B Test placeholder */}
                <div className="border-t border-slate-100 pt-5">
                  <button className="w-full py-2.5 px-4 rounded-lg border-2 border-dashed border-slate-200 text-sm text-slate-500 font-medium hover:border-slate-300 hover:text-slate-600 transition-colors">
                    + Create A/B Test
                  </button>
                </div>

                {/* Email body HTML */}
                <div className="border-t border-slate-100 pt-5">
                  <SectionHeading>Email Body (HTML)</SectionHeading>
                  <textarea
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    className="form-textarea"
                    rows={12}
                    placeholder="Paste your email HTML here, or leave empty to use the auto-generated template..."
                  />
                </div>
              </div>
            </div>

            {/* Right panel: live preview */}
            <div className="flex-1 bg-slate-100 overflow-y-auto">
              <div className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-600">Live Preview</h3>
                  <div className="flex items-center gap-2">
                    <button className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium">
                      Desktop
                    </button>
                    <button className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 font-medium">
                      Mobile
                    </button>
                  </div>
                </div>

                <div className="max-w-lg mx-auto bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  {bodyHtml ? (
                    <div className="p-6" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                  ) : (
                    <PreviewTemplate
                      brandName={brandName}
                      brandInitials={brandInitials}
                      primaryColor={primaryColor}
                      subjectLine={subjectLine || "Your exclusive offer awaits"}
                      previewText={previewText || "Discover what we have in store"}
                      node={node}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "overview" && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto p-8 space-y-6">
              <SectionHeading>Email Overview</SectionHeading>

              <div className="grid grid-cols-2 gap-4">
                <InfoCard label="Channel" value={isEmail ? "Email" : "SMS"} />
                <InfoCard label="Status" value={status.charAt(0).toUpperCase() + status.slice(1)} />
                <InfoCard label="Smart Sending" value={node.smartSending ? "ON" : "OFF"} />
                <InfoCard label="UTM Links" value={node.utmLinks !== false ? "Enabled" : "Disabled"} />
                <InfoCard label="AB Test" value={node.abTest?.description || "None"} />
                <InfoCard label="Discount" value={node.discountCode?.included ? (node.discountCode.description || "Yes") : "None"} />
                <InfoCard label="Filter Conditions" value={node.filterConditions || "N/A"} className="col-span-2" />
              </div>

              {node.implementationNotes && (
                <div className="bg-white rounded-lg border border-slate-200 p-5">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Implementation Notes</h4>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{node.implementationNotes}</p>
                </div>
              )}

              {node.strategy && (
                <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: primaryColor }}>
                    Strategy
                  </h4>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">Primary Focus</p>
                    <p className="text-sm text-slate-700">{node.strategy.primaryFocus}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">Secondary Focus</p>
                    <p className="text-sm text-slate-700">{node.strategy.secondaryFocus}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto p-8 space-y-6">
              <SectionHeading>Email Settings</SectionHeading>

              <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
                <h4 className="text-sm font-semibold text-slate-700">Sending Options</h4>

                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div>
                    <p className="text-sm text-slate-700">Smart Sending</p>
                    <p className="text-xs text-slate-500">Skip recipients who recently received an email</p>
                  </div>
                  <TogglePill enabled={node.smartSending ?? false} />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div>
                    <p className="text-sm text-slate-700">UTM Tracking</p>
                    <p className="text-xs text-slate-500">Automatically add UTM parameters to links</p>
                  </div>
                  <TogglePill enabled={node.utmLinks !== false} />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm text-slate-700">Discount Code</p>
                    <p className="text-xs text-slate-500">Include a discount code in this email</p>
                  </div>
                  <TogglePill enabled={node.discountCode?.included ?? false} />
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
                <h4 className="text-sm font-semibold text-slate-700">Filter Conditions</h4>
                <p className="text-sm text-slate-600">{node.filterConditions || "No filter conditions set"}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .form-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 13px;
          color: #1e293b;
          background: #fff;
          transition: border-color 0.15s, box-shadow 0.15s;
          outline: none;
        }
        .form-input:focus {
          border-color: #6495ED;
          box-shadow: 0 0 0 3px rgba(100, 149, 237, 0.1);
        }
        .form-input::placeholder {
          color: #94a3b8;
        }
        .form-textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 12px;
          font-family: 'SF Mono', 'Fira Code', 'Fira Mono', monospace;
          color: #1e293b;
          background: #f8fafc;
          resize: vertical;
          outline: none;
          transition: border-color 0.15s;
        }
        .form-textarea:focus {
          border-color: #6495ED;
          box-shadow: 0 0 0 3px rgba(100, 149, 237, 0.1);
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

/* ── Subcomponents ── */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
      {children}
    </h3>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function InfoCard({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-slate-200 p-4 ${className}`}>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function TogglePill({ enabled }: { enabled: boolean }) {
  return (
    <div className={`w-9 h-5 rounded-full relative transition-colors ${enabled ? "bg-emerald-500" : "bg-slate-200"}`}>
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
    </div>
  );
}

function PreviewTemplate({
  brandName,
  brandInitials,
  primaryColor,
  subjectLine,
  previewText,
  node,
}: {
  brandName: string;
  brandInitials: string;
  primaryColor: string;
  subjectLine: string;
  previewText: string;
  node: MessageNode;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-full py-6 flex flex-col items-center gap-2"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
      >
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-white text-lg font-bold">
          {brandInitials}
        </div>
        <h2 className="text-white text-lg font-bold">{brandName}</h2>
      </div>

      <div className="w-full px-6 py-6 space-y-4">
        <h3 className="text-xl font-bold text-slate-800 text-center">{subjectLine}</h3>
        <p className="text-sm text-slate-500 text-center">{previewText}</p>

        {node.discountCode?.included && (
          <div className="mx-auto max-w-xs border-2 border-dashed rounded-lg p-4 text-center" style={{ borderColor: `${primaryColor}40` }}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Exclusive Offer</p>
            <div className="text-base font-bold" style={{ color: primaryColor }}>
              {node.discountCode.description || "Special discount inside"}
            </div>
          </div>
        )}

        <div className="text-center">
          <div className="inline-block px-6 py-2.5 rounded-lg text-white font-semibold text-sm" style={{ background: primaryColor }}>
            Shop Now
          </div>
        </div>
      </div>

      <div className="w-full py-4 px-6 bg-slate-50 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-400">© {new Date().getFullYear()} {brandName}</p>
      </div>
    </div>
  );
}
