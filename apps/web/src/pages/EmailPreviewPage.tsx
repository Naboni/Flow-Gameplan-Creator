import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { loadStoredNode, type StoredNodePayload } from "../utils/nodeStore";
import type { FlowNode } from "@flow/core";

type MessageNode = Extract<FlowNode, { type: "message" }>;

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export function EmailPreviewPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const [payload, setPayload] = useState<StoredNodePayload | null>(null);

  useEffect(() => {
    const stored = loadStoredNode();
    if (stored && stored.nodeId === nodeId) {
      setPayload(stored);
    }
  }, [nodeId]);

  if (!payload) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-slate-700">No preview data found</h2>
          <p className="text-sm text-slate-500 mt-1">This window must be opened from the flow editor.</p>
        </div>
      </div>
    );
  }

  const node = payload.flowNode as MessageNode;
  const brandName = payload.brandName || "Brand";
  const subjectLine = node.emailContent?.subjectLine || node.copyHint || "Your exclusive offer awaits";
  const previewText = node.emailContent?.previewText || "Discover what we have in store for you";
  const senderName = node.emailContent?.senderName || brandName;
  const senderEmail = node.emailContent?.senderEmail || `hello@${brandName.toLowerCase().replace(/\s+/g, "")}.com`;
  const hasDiscount = node.discountCode?.included;
  const discountDesc = node.discountCode?.description || "Special offer inside";
  const bodyHtml = node.emailContent?.bodyHtml;
  const title = node.title || "Email";

  const brandInitials = getInitials(brandName);
  const isEmail = node.channel === "email";
  const primaryColor = isEmail ? "#6495ED" : "#4CAF50";

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ background: primaryColor }}
          >
            {brandInitials}
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-800">{title}</h1>
            <p className="text-xs text-slate-500">Preview · {senderName} &lt;{senderEmail}&gt;</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200">
            {node.status === "live" ? "Live" : node.status === "manual" ? "Manual" : "Draft"}
          </span>
          <button
            onClick={() => window.close()}
            className="text-xs px-3 py-1.5 rounded-md bg-slate-800 text-white hover:bg-slate-700 transition-colors font-medium"
          >
            Close Preview
          </button>
        </div>
      </div>

      {/* Email envelope info */}
      <div className="max-w-2xl mx-auto mt-6 mb-4 bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 w-16">From:</span>
            <span className="text-sm text-slate-800">{senderName} &lt;{senderEmail}&gt;</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 w-16">Subject:</span>
            <span className="text-sm font-medium text-slate-800">{subjectLine}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 w-16">Preview:</span>
            <span className="text-sm text-slate-500 italic">{previewText}</span>
          </div>
        </div>
      </div>

      {/* Email body */}
      <div className="max-w-2xl mx-auto mb-10">
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          {bodyHtml ? (
            <div
              className="p-6"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : (
            /* Default branded email template */
            <div className="flex flex-col items-center">
              {/* Brand header */}
              <div
                className="w-full py-8 flex flex-col items-center gap-3"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
              >
                <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-white text-xl font-bold">
                  {brandInitials}
                </div>
                <h2 className="text-white text-xl font-bold tracking-tight">{brandName}</h2>
              </div>

              <div className="w-full px-8 py-8 space-y-6">
                {/* Subject as headline */}
                <h3 className="text-2xl font-bold text-slate-800 text-center leading-tight">
                  {subjectLine}
                </h3>

                <p className="text-sm text-slate-600 text-center leading-relaxed max-w-md mx-auto">
                  {previewText}
                </p>

                {/* Discount section */}
                {hasDiscount && (
                  <div className="mx-auto max-w-sm border-2 border-dashed rounded-xl p-5 text-center"
                    style={{ borderColor: `${primaryColor}40` }}
                  >
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Exclusive Offer
                    </p>
                    <div className="text-lg font-bold" style={{ color: primaryColor }}>
                      {discountDesc}
                    </div>
                    {node.discountCode?.code && (
                      <div className="mt-3 inline-block px-5 py-2 rounded-lg bg-slate-100 text-sm font-mono font-bold text-slate-700 tracking-wider border border-slate-200">
                        {node.discountCode.code}
                      </div>
                    )}
                  </div>
                )}

                {/* Implementation notes */}
                {node.implementationNotes && (
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Content Direction
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {node.implementationNotes}
                    </p>
                  </div>
                )}

                {/* Strategy section */}
                {node.strategy && (
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: primaryColor }}>
                      Strategy
                    </p>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-0.5">Primary Focus</p>
                      <p className="text-sm text-slate-700">{node.strategy.primaryFocus}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-0.5">Secondary Focus</p>
                      <p className="text-sm text-slate-700">{node.strategy.secondaryFocus}</p>
                    </div>
                  </div>
                )}

                {/* CTA */}
                <div className="text-center pt-2">
                  <div
                    className="inline-block px-8 py-3 rounded-lg text-white font-semibold text-sm cursor-default"
                    style={{ background: primaryColor }}
                  >
                    Shop Now
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="w-full py-6 px-8 bg-slate-50 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400">
                  © {new Date().getFullYear()} {brandName}. All rights reserved.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  <span className="underline cursor-default">Unsubscribe</span> · <span className="underline cursor-default">Manage Preferences</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
