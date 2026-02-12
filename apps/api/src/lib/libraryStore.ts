import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { FlowTemplate, FlowType } from "@flow/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = path.resolve(__dirname, "../../library");

async function ensureDir() {
  await fs.mkdir(LIBRARY_DIR, { recursive: true });
}

function filePath(flowType: FlowType): string {
  return path.join(LIBRARY_DIR, `${flowType}.json`);
}

export async function getTemplates(flowType: FlowType): Promise<FlowTemplate[]> {
  try {
    const data = await fs.readFile(filePath(flowType), "utf-8");
    return JSON.parse(data) as FlowTemplate[];
  } catch {
    return [];
  }
}

export async function getAllTemplates(): Promise<Record<FlowType, FlowTemplate[]>> {
  await ensureDir();
  const files = await fs.readdir(LIBRARY_DIR);
  const result: Partial<Record<FlowType, FlowTemplate[]>> = {};

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const flowType = file.replace(".json", "") as FlowType;
    try {
      const data = await fs.readFile(path.join(LIBRARY_DIR, file), "utf-8");
      result[flowType] = JSON.parse(data) as FlowTemplate[];
    } catch {
      // skip corrupted files
    }
  }

  return result as Record<FlowType, FlowTemplate[]>;
}

export async function getTemplateById(flowType: FlowType, templateId: string): Promise<FlowTemplate | null> {
  const templates = await getTemplates(flowType);
  return templates.find((t) => t.id === templateId) ?? null;
}

export async function createTemplate(template: FlowTemplate): Promise<FlowTemplate> {
  await ensureDir();
  const templates = await getTemplates(template.flowType);

  if (templates.some((t) => t.id === template.id)) {
    throw new Error(`Template with id "${template.id}" already exists.`);
  }

  const now = new Date().toISOString();
  const newTemplate: FlowTemplate = { ...template, createdAt: now, updatedAt: now };
  templates.push(newTemplate);
  await fs.writeFile(filePath(template.flowType), JSON.stringify(templates, null, 2));
  return newTemplate;
}

export async function updateTemplate(flowType: FlowType, templateId: string, updates: Partial<FlowTemplate>): Promise<FlowTemplate> {
  const templates = await getTemplates(flowType);
  const idx = templates.findIndex((t) => t.id === templateId);
  if (idx === -1) throw new Error(`Template "${templateId}" not found.`);

  const updated: FlowTemplate = {
    ...templates[idx],
    ...updates,
    id: templateId,
    flowType,
    updatedAt: new Date().toISOString()
  };
  templates[idx] = updated;
  await fs.writeFile(filePath(flowType), JSON.stringify(templates, null, 2));
  return updated;
}

export async function deleteTemplate(flowType: FlowType, templateId: string): Promise<void> {
  const templates = await getTemplates(flowType);
  const filtered = templates.filter((t) => t.id !== templateId);
  if (filtered.length === templates.length) throw new Error(`Template "${templateId}" not found.`);
  await fs.writeFile(filePath(flowType), JSON.stringify(filtered, null, 2));
}
