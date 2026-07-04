import type {
  CoreFieldKey,
  FieldRef,
  Preset,
  WorkflowJson,
  WorkflowNode,
} from "../types";

export interface GenerationValues {
  prompt?: string;
  negative?: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  megapixels?: number;
  model?: string;
  batchSize?: number;
  /** toggle key -> value */
  toggles?: Record<string, boolean>;
  /** parallel to preset.loras */
  loras?: { name?: string; strength?: number }[];
}

export function randomSeed(): number {
  // ComfyUI seeds are u64; stay within JS safe-integer range
  return Math.floor(Math.random() * 1_000_000_000_000_000);
}

function setInput(wf: WorkflowJson, ref: FieldRef, value: unknown) {
  const node = wf[ref.node];
  if (!node) throw new Error(`preset maps missing node ${ref.node}`);
  node.inputs[ref.input] = value;
}

/** Deep-clone the preset workflow and apply the user's values via field mappings. */
export function buildWorkflow(
  preset: Preset,
  values: GenerationValues,
): WorkflowJson {
  const wf: WorkflowJson = JSON.parse(JSON.stringify(preset.workflow));
  const f = preset.fields;

  const simple: [CoreFieldKey, unknown][] = [
    ["prompt", values.prompt],
    ["negative", values.negative],
    ["seed", values.seed],
    ["steps", values.steps],
    ["cfg", values.cfg],
    ["sampler", values.sampler],
    ["scheduler", values.scheduler],
    ["width", values.width],
    ["height", values.height],
    ["aspectRatio", values.aspectRatio],
    ["megapixels", values.megapixels],
    ["model", values.model],
    ["batchSize", values.batchSize],
  ];
  for (const [key, value] of simple) {
    const ref = f[key];
    if (ref && value !== undefined) setInput(wf, ref, value);
  }

  for (const toggle of preset.toggles ?? []) {
    const v = values.toggles?.[toggle.key];
    if (v !== undefined) setInput(wf, toggle.ref, v);
  }

  (preset.loras ?? []).forEach((lora, i) => {
    const v = values.loras?.[i];
    if (!v) return;
    if (v.name !== undefined) setInput(wf, lora.nameRef, v.name);
    if (v.strength !== undefined && lora.strengthRef)
      setInput(wf, lora.strengthRef, v.strength);
  });

  return wf;
}

/** Read the current default value a mapping points at inside the preset workflow. */
export function mappedValue(preset: Preset, ref: FieldRef | undefined) {
  if (!ref) return undefined;
  return preset.workflow[ref.node]?.inputs[ref.input];
}

/** Node ids -> "id · ClassType (title)" labels for mapping dropdowns. */
export function describeNodes(wf: WorkflowJson): { id: string; label: string }[] {
  return Object.entries(wf)
    .map(([id, node]) => ({
      id,
      label: `${id} · ${node.class_type}${node._meta?.title ? ` (${node._meta.title})` : ""}`,
    }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Literal (non-link) input names of a node — candidates for field mapping. */
export function literalInputs(node: WorkflowNode): string[] {
  return Object.entries(node.inputs)
    .filter(([, v]) => !isLink(v))
    .map(([k]) => k);
}

function isLink(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "string" &&
    typeof v[1] === "number"
  );
}

/** Resolve a link input one or more hops to its source node id. */
function sourceOf(wf: WorkflowJson, nodeId: string, input: string): string | null {
  const v = wf[nodeId]?.inputs[input];
  return isLink(v) ? ((v as [string, number])[0] ?? null) : null;
}

/** Heuristic auto-mapping for a freshly imported API workflow. */
export function guessFields(wf: WorkflowJson): Preset["fields"] {
  const fields: Preset["fields"] = {};
  const entries = Object.entries(wf);
  const byClass = (pred: (ct: string) => boolean) =>
    entries.filter(([, n]) => pred(n.class_type));

  // sampler node
  const sampler = byClass((ct) => ct === "KSampler" || ct === "KSamplerAdvanced")[0];
  if (sampler) {
    const [id, node] = sampler;
    const seedInput = "seed" in node.inputs ? "seed" : "noise_seed";
    if (!isLinkInput(node, seedInput)) fields.seed = { node: id, input: seedInput };
    for (const [key, input] of [
      ["steps", "steps"],
      ["cfg", "cfg"],
      ["sampler", "sampler_name"],
      ["scheduler", "scheduler"],
    ] as const) {
      if (input in node.inputs && !isLinkInput(node, input))
        fields[key] = { node: id, input };
    }
  }

  // model loader
  const unet = byClass((ct) => ct === "UNETLoader")[0];
  const ckpt = byClass((ct) => ct.startsWith("CheckpointLoader"))[0];
  if (unet) fields.model = { node: unet[0], input: "unet_name" };
  else if (ckpt) fields.model = { node: ckpt[0], input: "ckpt_name" };

  // resolution
  const resSel = byClass((ct) => ct === "ResolutionSelector")[0];
  const latent = byClass((ct) => ct === "EmptyLatentImage" || ct === "EmptySD3LatentImage")[0];
  if (resSel) {
    fields.aspectRatio = { node: resSel[0], input: "aspect_ratio" };
    fields.megapixels = { node: resSel[0], input: "megapixels" };
  }
  if (latent) {
    const [id, node] = latent;
    if (!isLinkInput(node, "width")) fields.width = { node: id, input: "width" };
    if (!isLinkInput(node, "height")) fields.height = { node: id, input: "height" };
    if (!isLinkInput(node, "batch_size"))
      fields.batchSize = { node: id, input: "batch_size" };
  }

  // prompt: prefer a string primitive titled "user prompt", else literal CLIPTextEncode
  const userPrompt = entries.find(
    ([, n]) =>
      (n.class_type === "PrimitiveStringMultiline" || n.class_type === "PrimitiveString") &&
      (n._meta?.title ?? "").toLowerCase().includes("user prompt"),
  );
  const literalClips = byClass((ct) => ct === "CLIPTextEncode").filter(
    ([, n]) => typeof n.inputs.text === "string",
  );
  // negative: the CLIPTextEncode wired (possibly via one hop) into KSampler.negative
  let negativeClipId: string | null = null;
  if (sampler) {
    let src = sourceOf(wf, sampler[0], "negative");
    for (let hop = 0; src && hop < 3; hop++) {
      if (wf[src]?.class_type === "CLIPTextEncode") {
        negativeClipId = src;
        break;
      }
      src = sourceOf(wf, src, "conditioning");
    }
  }
  if (userPrompt) {
    fields.prompt = { node: userPrompt[0], input: "value" };
  } else {
    const positive = literalClips.find(([id]) => id !== negativeClipId);
    if (positive) fields.prompt = { node: positive[0], input: "text" };
  }
  if (negativeClipId && typeof wf[negativeClipId].inputs.text === "string") {
    fields.negative = { node: negativeClipId, input: "text" };
  }

  return fields;
}

function isLinkInput(node: WorkflowNode, input: string): boolean {
  return isLink(node.inputs[input]);
}

/** Guess LoRA slots + boolean toggles from an imported workflow. */
export function guessExtras(wf: WorkflowJson): {
  loras: NonNullable<Preset["loras"]>;
  toggles: NonNullable<Preset["toggles"]>;
} {
  const loras: NonNullable<Preset["loras"]> = [];
  const toggles: NonNullable<Preset["toggles"]> = [];
  for (const [id, node] of Object.entries(wf)) {
    if (node.class_type.includes("LoraLoader")) {
      loras.push({
        label: node._meta?.title ?? `LoRA ${id}`,
        nameRef: { node: id, input: "lora_name" },
        strengthRef:
          "strength_model" in node.inputs
            ? { node: id, input: "strength_model" }
            : undefined,
      });
    }
    if (node.class_type === "PrimitiveBoolean") {
      toggles.push({
        key: `bool_${id}`,
        label: node._meta?.title ?? `Toggle ${id}`,
        ref: { node: id, input: "value" },
        default: node.inputs.value === true,
      });
    }
  }
  return { loras, toggles };
}
