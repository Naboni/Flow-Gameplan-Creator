import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { loadStoredNode, type StoredNodePayload } from "../utils/nodeStore";
import type { FlowNode } from "@flow/core";

type MessageNode = Extract<FlowNode, { type: "message" }>;

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
  const brandLogoUrl = payload.brandLogoUrl;
  const brandColor = payload.brandColor || (node.channel === "email" ? "#6495ED" : "#4CAF50");
  const subjectLine = node.emailContent?.subjectLine || node.copyHint || "Your exclusive offer awaits";
  const previewText = node.emailContent?.previewText || "Discover what we have in store for you";
  const senderName = node.emailContent?.senderName || brandName;
  const senderEmail = node.emailContent?.senderEmail || `hello@${brandName.toLowerCase().replace(/\s+/g, "")}.com`;
  const hasDiscount = node.discountCode?.included;
  const discountDesc = node.discountCode?.description || "Special offer inside";
  const bodyHtml = node.emailContent?.bodyHtml;
  const title = node.title || "Email";

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {brandLogoUrl ? (
            <img
              src={brandLogoUrl}
              alt={brandName}
              className="w-8 h-8 rounded-lg object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ background: brandColor }}
            >
              {brandName.slice(0, 1).toUpperCase()}
            </div>
          )}
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
            <div className="flex flex-col items-center">
              {/* Brand header — shows real logo on a light tinted background */}
              <div
                className="w-full py-8 flex flex-col items-center gap-3"
                style={{ background: `${brandColor}18` }}
              >
                {brandLogoUrl ? (
                  <img
                    src={brandLogoUrl}
                    alt={brandName}
                    className="h-14 max-w-[200px] object-contain"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = "none";
                    }}
                  />
                ) : (
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold"
                    style={{ background: brandColor }}
                  >
                    {brandName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <h2 className="text-lg font-bold tracking-tight" style={{ color: brandColor }}>
                  {brandName}
                </h2>
              </div>

              <div className="w-full px-8 py-8 space-y-6">
                <h3 className="text-2xl font-bold text-slate-800 text-center leading-tight">
                  {subjectLine}
                </h3>

                <p className="text-sm text-slate-600 text-center leading-relaxed max-w-md mx-auto">
                  {previewText}
                </p>

                {/* Discount section */}
                {hasDiscount && (
                  <div className="mx-auto max-w-sm border-2 border-dashed rounded-xl p-5 text-center"
                    style={{ borderColor: `${brandColor}40` }}
                  >
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Exclusive Offer
                    </p>
                    <div className="text-lg font-bold" style={{ color: brandColor }}>
                      {discountDesc}
                    </div>
                    {node.discountCode?.code && (
                      <div className="mt-3 inline-block px-5 py-2 rounded-lg bg-slate-100 text-sm font-mono font-bold text-slate-700 tracking-wider border border-slate-200">
                        {node.discountCode.code}
                      </div>
                    )}
                  </div>
                )}

                {/* Content direction */}
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

                {/* CTA button */}
                <div className="text-center pt-2">
                  <div
                    className="inline-block px-8 py-3 rounded-lg text-white font-semibold text-sm cursor-default"
                    style={{ background: brandColor }}
                  >
                    Shop Now
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="w-full py-6 px-8 bg-slate-800 text-center space-y-3">
                <div className="flex items-center justify-center gap-4">
                  <svg className="w-5 h-5 text-white/60" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                  <svg className="w-5 h-5 text-white/60" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                </div>
                <p className="text-xs text-white/40">
                  No longer want to receive these emails? <span className="underline cursor-default text-white/50">Unsubscribe</span>
                </p>
                <p className="text-xs text-white/30">
                  {brandName}
                </p>
              </div>

              {/* Powered by ZHS Ecom */}
              <div className="w-full py-4 flex items-center justify-center bg-white">
                <span className="text-[10px] text-slate-400 mr-1.5">Powered by</span>
                <img src="/logo.png" alt="ZHS Ecom" className="h-5 object-contain" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
