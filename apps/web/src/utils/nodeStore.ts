import type { FlowNode } from "@flow/core";

const STORAGE_KEY = "flow-node-edit";

export type StoredNodePayload = {
  nodeId: string;
  flowNode: FlowNode;
  brandName?: string;
  brandUrl?: string;
  brandLogoUrl?: string;
  brandColor?: string;
  timestamp: number;
};

export function storeNodeForEdit(payload: StoredNodePayload) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadStoredNode(): StoredNodePayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredNodePayload;
  } catch {
    return null;
  }
}

export function clearStoredNode() {
  localStorage.removeItem(STORAGE_KEY);
}

const SAVE_KEY = "flow-node-save";

export type SavedNodePayload = {
  nodeId: string;
  flowNode: FlowNode;
  timestamp: number;
};

export function storeSavedNode(payload: SavedNodePayload) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

export function loadSavedNode(): SavedNodePayload | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedNodePayload;
  } catch {
    return null;
  }
}

export function clearSavedNode() {
  localStorage.removeItem(SAVE_KEY);
}
