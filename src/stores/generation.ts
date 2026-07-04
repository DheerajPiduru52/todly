import { create } from "zustand";
import type { ImageRef, Job, JobStatus, WorkflowJson } from "../types";
import { comfyWs } from "../api/ws";
import { getHistory, queuePrompt } from "../api/comfy";

interface GenerationState {
  jobs: Record<string, Job>;
  order: string[]; // newest first
  queueRemaining: number;
  previewUrl: string | null;
  activePromptId: string | null;
  /** bumped whenever new output images land, so the gallery can refresh */
  galleryVersion: number;
}

export const useGeneration = create<GenerationState>(() => ({
  jobs: {},
  order: [],
  queueRemaining: 0,
  previewUrl: null,
  activePromptId: null,
  galleryVersion: 0,
}));

const waiters = new Map<string, (status: JobStatus) => void>();

/** Resolves when the given prompt finishes (done / error / cancelled). */
export function awaitCompletion(promptId: string): Promise<JobStatus> {
  const job = useGeneration.getState().jobs[promptId];
  if (job && (job.status === "done" || job.status === "error" || job.status === "cancelled")) {
    return Promise.resolve(job.status);
  }
  return new Promise((resolve) => waiters.set(promptId, resolve));
}

function patchJob(promptId: string, patch: Partial<Job>) {
  useGeneration.setState((s) => {
    const job = s.jobs[promptId];
    if (!job) return s;
    return { jobs: { ...s.jobs, [promptId]: { ...job, ...patch } } };
  });
}

function finishJob(promptId: string, status: JobStatus, error?: string) {
  const job = useGeneration.getState().jobs[promptId];
  if (!job) {
    waiters.get(promptId)?.(status);
    waiters.delete(promptId);
    return;
  }
  patchJob(promptId, {
    status,
    error,
    finishedAt: Date.now(),
    progress: null,
    currentNode: null,
  });
  // fallback: if WS missed the executed event, pull images from history
  if (status === "done" && job.images.length === 0) {
    getHistory(promptId)
      .then((h) => {
        const entry = h[promptId];
        if (!entry) return;
        const images: ImageRef[] = [];
        for (const out of Object.values(entry.outputs)) {
          for (const img of out.images ?? []) {
            if (img.type === "output") images.push(img);
          }
        }
        if (images.length) {
          patchJob(promptId, { images });
          bumpGallery();
        }
      })
      .catch(() => {});
  }
  waiters.get(promptId)?.(status);
  waiters.delete(promptId);
}

function bumpGallery() {
  useGeneration.setState((s) => ({ galleryVersion: s.galleryVersion + 1 }));
}

let attached = false;

/** Wire ComfyUI websocket events into the job store. Call once at startup. */
export function attachGenerationListeners() {
  if (attached) return;
  attached = true;

  comfyWs.onPreview((url) => useGeneration.setState({ previewUrl: url }));

  comfyWs.onEvent((ev) => {
    const d = ev.data;
    const promptId = typeof d.prompt_id === "string" ? d.prompt_id : null;
    switch (ev.type) {
      case "status": {
        const remaining =
          (d.status as { exec_info?: { queue_remaining?: number } } | undefined)
            ?.exec_info?.queue_remaining ?? 0;
        useGeneration.setState({ queueRemaining: remaining });
        break;
      }
      case "execution_start":
        if (promptId) {
          useGeneration.setState({ activePromptId: promptId, previewUrl: null });
          patchJob(promptId, { status: "running", startedAt: Date.now() });
        }
        break;
      case "executing":
        if (promptId && d.node) {
          patchJob(promptId, { currentNode: String(d.node) });
        }
        break;
      case "progress":
        if (promptId && typeof d.value === "number" && typeof d.max === "number") {
          patchJob(promptId, {
            status: "running",
            progress: { value: d.value, max: d.max },
          });
        }
        break;
      case "executed": {
        if (!promptId) break;
        const output = d.output as
          | { images?: { filename: string; subfolder: string; type: string }[] }
          | undefined;
        const imgs = (output?.images ?? []).filter((i) => i.type === "output");
        if (imgs.length) {
          const job = useGeneration.getState().jobs[promptId];
          if (job) patchJob(promptId, { images: [...job.images, ...imgs] });
          bumpGallery();
        }
        break;
      }
      case "execution_success":
        if (promptId) finishJob(promptId, "done");
        break;
      case "execution_error":
        if (promptId)
          finishJob(
            promptId,
            "error",
            String(d.exception_message ?? "execution error"),
          );
        break;
      case "execution_interrupted":
        if (promptId) finishJob(promptId, "cancelled");
        break;
    }
  });
}

export interface SubmitInfo {
  presetName: string;
  prompt: string;
  seed: number | null;
  batchId?: string;
}

/** Queue a workflow and register a tracked job for it. */
export async function submitWorkflow(
  workflow: WorkflowJson,
  info: SubmitInfo,
): Promise<string> {
  const res = await queuePrompt(workflow, comfyWs.clientId);
  const job: Job = {
    promptId: res.prompt_id,
    presetName: info.presetName,
    prompt: info.prompt,
    seed: info.seed,
    startedAt: Date.now(),
    status: "pending",
    progress: null,
    currentNode: null,
    images: [],
    batchId: info.batchId,
  };
  useGeneration.setState((s) => ({
    jobs: { ...s.jobs, [job.promptId]: job },
    order: [job.promptId, ...s.order].slice(0, 200),
  }));
  return res.prompt_id;
}

/** Average duration of completed jobs this session (for batch ETA). */
export function averageJobDurationMs(): number | null {
  const { jobs } = useGeneration.getState();
  const done = Object.values(jobs).filter(
    (j) => j.status === "done" && j.finishedAt,
  );
  if (done.length === 0) return null;
  const total = done.reduce((acc, j) => acc + (j.finishedAt! - j.startedAt), 0);
  return total / done.length;
}
