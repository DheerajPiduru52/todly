import { convertFileSrc } from "@tauri-apps/api/core";
import type { ImageRef, TodlyConfig } from "../types";

/**
 * Images are loaded from disk via the asset protocol rather than ComfyUI's
 * /view endpoint — the server 403s cross-origin browser requests, and this
 * also keeps the gallery working when ComfyUI is offline.
 */
export function fileSrc(path: string): string {
  return convertFileSrc(path);
}

export function imageRefSrc(ref: ImageRef, config: TodlyConfig | null): string {
  if (!config) return "";
  const base =
    ref.type === "temp" ? `${config.comfyRoot}\\temp` : config.outputDir;
  const sub = ref.subfolder ? `${ref.subfolder.replace(/\//g, "\\")}\\` : "";
  return convertFileSrc(`${base}\\${sub}${ref.filename}`);
}
