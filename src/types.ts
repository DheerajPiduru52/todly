export interface TodlyConfig {
  comfyHost: string;
  comfyPort: number;
  comfyRoot: string;
  outputDir: string;
  modelsDir: string;
  defaultPresetId: string | null;
  autoLaunchComfy: boolean;
}

/** ComfyUI API-format workflow: node id -> { class_type, inputs } */
export type WorkflowNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
};
export type WorkflowJson = Record<string, WorkflowNode>;

export interface FieldRef {
  node: string;
  input: string;
}

export type CoreFieldKey =
  | "prompt"
  | "negative"
  | "seed"
  | "steps"
  | "cfg"
  | "sampler"
  | "scheduler"
  | "width"
  | "height"
  | "aspectRatio"
  | "megapixels"
  | "model"
  | "batchSize";

export interface PresetToggle {
  key: string;
  label: string;
  ref: FieldRef;
  default?: boolean;
}

export interface PresetLora {
  label: string;
  nameRef: FieldRef;
  strengthRef?: FieldRef;
  /** key of a toggle in `toggles` that enables/disables this LoRA */
  toggleKey?: string;
}

export interface Preset {
  id: string;
  name: string;
  description?: string;
  workflow: WorkflowJson;
  fields: Partial<Record<CoreFieldKey, FieldRef>>;
  toggles?: PresetToggle[];
  loras?: PresetLora[];
  createdAt?: string;
}

export interface ImageRef {
  filename: string;
  subfolder: string;
  type: string; // "output" | "temp"
}

export interface GalleryItem {
  fileName: string;
  subfolder: string;
  path: string;
  size: number;
  modifiedMs: number;
}

export interface ModelFile {
  name: string;
  folder: string;
  size: number;
}

export type JobStatus = "pending" | "running" | "done" | "error" | "cancelled";

export interface Job {
  promptId: string;
  presetName: string;
  prompt: string;
  seed: number | null;
  startedAt: number;
  finishedAt?: number;
  status: JobStatus;
  progress: { value: number; max: number } | null;
  currentNode: string | null;
  images: ImageRef[];
  error?: string;
  batchId?: string;
}

export type BatchItemStatus = JobStatus;

export interface BatchItem {
  index: number;
  prompt: string;
  seed: number | null;
  status: BatchItemStatus;
  promptId?: string;
  images: ImageRef[];
  durationMs?: number;
  error?: string;
}

export interface BatchManifest {
  id: string;
  name: string;
  presetId: string;
  presetName: string;
  createdAt: string;
  items: {
    index: number;
    prompt: string;
    seed: number | null;
    status: BatchItemStatus;
    images: ImageRef[];
  }[];
}

/** node metadata parsed out of a PNG's embedded API workflow */
export interface ParsedImageMeta {
  seed?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  models: string[];
  loras: { name: string; strength?: number }[];
  texts: { title: string; text: string }[];
  raw?: WorkflowJson;
}
