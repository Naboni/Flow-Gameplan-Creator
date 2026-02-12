import type { Request, Response } from "express";
import { FLOW_TYPE_LABELS, type FlowType, type FlowTemplate } from "@flow/core";
import {
  getAllTemplates,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "../lib/libraryStore.js";

const VALID_FLOW_TYPES = new Set(Object.keys(FLOW_TYPE_LABELS));

function isValidFlowType(val: string): val is FlowType {
  return VALID_FLOW_TYPES.has(val);
}

export async function listAllTemplates(_req: Request, res: Response) {
  try {
    const all = await getAllTemplates();
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function listTemplatesByType(req: Request, res: Response) {
  const flowType = req.params.flowType as string;
  if (!isValidFlowType(flowType)) {
    res.status(400).json({ error: `Invalid flowType. Must be one of: ${[...VALID_FLOW_TYPES].join(", ")}` });
    return;
  }
  try {
    const templates = await getTemplates(flowType);
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function createTemplateRoute(req: Request, res: Response) {
  const flowType = req.params.flowType as string;
  if (!isValidFlowType(flowType)) {
    res.status(400).json({ error: `Invalid flowType.` });
    return;
  }

  const body = req.body as Partial<FlowTemplate>;
  if (!body.name || body.emailCount == null || body.smsCount == null || !body.triggerEvent) {
    res.status(400).json({ error: "name, triggerEvent, emailCount, and smsCount are required." });
    return;
  }

  try {
    const template = await createTemplate({
      id: `${flowType}_${Date.now()}`,
      flowType,
      name: body.name,
      description: body.description ?? "",
      triggerEvent: body.triggerEvent,
      emailCount: body.emailCount,
      smsCount: body.smsCount,
      hasSplit: body.hasSplit ?? false,
      splitCondition: body.splitCondition,
      splitSegments: body.splitSegments,
      isDefault: false,
      createdAt: "",
      updatedAt: "",
    });
    res.status(201).json(template);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
}

export async function updateTemplateRoute(req: Request, res: Response) {
  const flowType = req.params.flowType as string;
  const templateId = req.params.templateId as string;
  if (!isValidFlowType(flowType)) {
    res.status(400).json({ error: `Invalid flowType.` });
    return;
  }

  try {
    const updated = await updateTemplate(flowType, templateId, req.body);
    res.json(updated);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
}

export async function deleteTemplateRoute(req: Request, res: Response) {
  const flowType = req.params.flowType as string;
  const templateId = req.params.templateId as string;
  if (!isValidFlowType(flowType)) {
    res.status(400).json({ error: `Invalid flowType.` });
    return;
  }

  try {
    await deleteTemplate(flowType, templateId);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
}
