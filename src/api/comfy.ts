import { invoke } from "@tauri-apps/api/core";
import type { WorkflowJson } from "../types";

interface RawResponse {
  status: number;
  body: string;
}

/** All ComfyUI HTTP goes through Rust — browser-context requests get 403'd
 *  by the server's cross-origin middleware. */
function comfyFetch(
  path: string,
  init?: { method?: string; body?: string },
): Promise<RawResponse> {
  return invoke<RawResponse>("comfy_fetch", {
    method: init?.method ?? "GET",
    url: `${httpBase()}${path}`,
    body: init?.body ?? null,
  });
}

let host = "127.0.0.1";
let port = 8188;

export function setComfyAddress(h: string, p: number) {
  host = h;
  port = p;
}

export function getComfyAddress() {
  return { host, port };
}

export function httpBase() {
  return `http://${host}:${port}`;
}

export function wsUrl(clientId: string) {
  return `ws://${host}:${port}/ws?clientId=${clientId}`;
}

/** URL for displaying an image ComfyUI knows about (output/temp folders). */
export function viewUrl(filename: string, subfolder = "", type = "output") {
  const q = new URLSearchParams({ filename, subfolder, type });
  return `${httpBase()}/view?${q.toString()}`;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await comfyFetch(path);
  if (res.status !== 200) throw new Error(`${path} -> HTTP ${res.status}`);
  return JSON.parse(res.body) as T;
}

export const getSystemStats = () =>
  getJson<{ system: { comfyui_version: string; ram_free: number } }>(
    "/system_stats",
  );

export const getObjectInfo = () =>
  getJson<Record<string, ObjectInfoNode>>("/object_info");

export interface ObjectInfoNode {
  input: {
    required?: Record<string, unknown[]>;
    optional?: Record<string, unknown[]>;
  };
  output: string[];
  display_name: string;
  category: string;
}

/** Extract combo options for a node class input, handling both schema shapes. */
export function comboOptions(
  objectInfo: Record<string, ObjectInfoNode> | null,
  classType: string,
  inputName: string,
): string[] | null {
  const node = objectInfo?.[classType];
  if (!node) return null;
  const spec =
    node.input.required?.[inputName] ?? node.input.optional?.[inputName];
  if (!spec) return null;
  if (Array.isArray(spec[0])) return spec[0] as string[];
  if (spec[0] === "COMBO") {
    const opts = (spec[1] as { options?: string[] } | undefined)?.options;
    return opts ?? null;
  }
  return null;
}

/** Numeric constraints (min/max/step/default) for a node class input, if any. */
export function numericSpec(
  objectInfo: Record<string, ObjectInfoNode> | null,
  classType: string,
  inputName: string,
): { min?: number; max?: number; step?: number; default?: number } | null {
  const node = objectInfo?.[classType];
  if (!node) return null;
  const spec =
    node.input.required?.[inputName] ?? node.input.optional?.[inputName];
  if (!spec || (spec[0] !== "INT" && spec[0] !== "FLOAT")) return null;
  return (spec[1] ?? {}) as { min?: number; max?: number; step?: number };
}

export async function queuePrompt(
  workflow: WorkflowJson,
  clientId: string,
): Promise<{ prompt_id: string; number: number }> {
  const res = await comfyFetch("/prompt", {
    method: "POST",
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (res.status !== 200) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = JSON.parse(res.body) as {
        error?: { message?: string };
        node_errors?: Record<string, { errors?: { message?: string }[] }>;
      };
      const parts: string[] = [];
      if (body.error?.message) parts.push(body.error.message);
      for (const [nodeId, ne] of Object.entries(body.node_errors ?? {})) {
        for (const e of ne.errors ?? []) {
          if (e.message) parts.push(`node ${nodeId}: ${e.message}`);
        }
      }
      if (parts.length) detail = parts.join("; ");
    } catch {
      /* keep generic detail */
    }
    throw new Error(detail);
  }
  return JSON.parse(res.body) as { prompt_id: string; number: number };
}

export type QueueEntry = [number, string, WorkflowJson, unknown, unknown];

export const getQueue = () =>
  getJson<{ queue_running: QueueEntry[]; queue_pending: QueueEntry[] }>(
    "/queue",
  );

export async function cancelQueueItems(promptIds: string[]) {
  await comfyFetch("/queue", {
    method: "POST",
    body: JSON.stringify({ delete: promptIds }),
  });
}

export async function clearQueue() {
  await comfyFetch("/queue", {
    method: "POST",
    body: JSON.stringify({ clear: true }),
  });
}

export async function interrupt() {
  await comfyFetch("/interrupt", { method: "POST" });
}

export interface HistoryEntry {
  outputs: Record<
    string,
    { images?: { filename: string; subfolder: string; type: string }[] }
  >;
  status: { status_str: string; completed: boolean };
}

export const getHistory = (promptId: string) =>
  getJson<Record<string, HistoryEntry>>(`/history/${promptId}`);
