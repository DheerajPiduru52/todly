import type { ParsedImageMeta, WorkflowJson } from "../types";

/** Pull human-relevant settings out of an embedded API-format workflow. */
export function parseWorkflowMeta(raw: string): ParsedImageMeta | null {
  let wf: WorkflowJson;
  try {
    wf = JSON.parse(raw) as WorkflowJson;
  } catch {
    return null;
  }
  const meta: ParsedImageMeta = { models: [], loras: [], texts: [], raw: wf };

  for (const node of Object.values(wf)) {
    const ct = node.class_type;
    const inp = node.inputs;
    if (ct === "KSampler" || ct === "KSamplerAdvanced") {
      const seed = inp.seed ?? inp.noise_seed;
      if (typeof seed === "number") meta.seed = seed;
      if (typeof inp.steps === "number") meta.steps = inp.steps;
      if (typeof inp.cfg === "number") meta.cfg = inp.cfg;
      if (typeof inp.sampler_name === "string") meta.sampler = inp.sampler_name;
      if (typeof inp.scheduler === "string") meta.scheduler = inp.scheduler;
    } else if (ct === "UNETLoader" && typeof inp.unet_name === "string") {
      meta.models.push(inp.unet_name);
    } else if (ct.startsWith("CheckpointLoader") && typeof inp.ckpt_name === "string") {
      meta.models.push(inp.ckpt_name);
    } else if (ct.includes("LoraLoader") && typeof inp.lora_name === "string") {
      meta.loras.push({
        name: inp.lora_name,
        strength:
          typeof inp.strength_model === "number" ? inp.strength_model : undefined,
      });
    }

    // collect literal text fields worth showing
    const title = node._meta?.title ?? ct;
    for (const key of ["text", "value", "string"]) {
      const v = inp[key];
      if (
        typeof v === "string" &&
        v.trim().length > 0 &&
        (ct === "CLIPTextEncode" ||
          ct === "PrimitiveStringMultiline" ||
          ct === "PrimitiveString")
      ) {
        meta.texts.push({ title, text: v });
      }
    }
  }

  // surface the likely user prompt first
  meta.texts.sort((a, b) => rank(a.title) - rank(b.title));
  return meta;
}

function rank(title: string): number {
  const t = title.toLowerCase();
  if (t.includes("user prompt")) return 0;
  if (t.includes("prompt") && !t.includes("system")) return 1;
  if (t.includes("system")) return 3;
  return 2;
}

/** Best guess at the user-facing prompt for list displays. */
export function primaryPrompt(meta: ParsedImageMeta): string | null {
  return meta.texts.length > 0 ? meta.texts[0].text : null;
}
