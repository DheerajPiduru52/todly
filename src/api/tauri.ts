import { invoke } from "@tauri-apps/api/core";
import type {
  TodlyConfig,
  Preset,
  GalleryItem,
  ModelFile,
  BatchManifest,
} from "../types";

export const getConfig = () => invoke<TodlyConfig>("get_config");
export const saveConfig = (config: TodlyConfig) =>
  invoke<void>("save_config", { config });
export const getDataDir = () => invoke<string>("get_data_dir");

export const listPresets = () => invoke<Preset[]>("list_presets");
export const savePreset = (preset: Preset) =>
  invoke<void>("save_preset", { preset });
export const deletePreset = (id: string) =>
  invoke<void>("delete_preset", { id });

export const listGallery = (outputDir: string) =>
  invoke<GalleryItem[]>("list_gallery", { outputDir });
export const readImageMetadata = (path: string) =>
  invoke<{ prompt: string | null; workflow: string | null }>(
    "read_image_metadata",
    { path },
  );
export const deleteImage = (path: string, outputDir: string) =>
  invoke<void>("delete_image", { path, outputDir });

export const readTextFile = (path: string) =>
  invoke<string>("read_text_file", { path });
export const writeTextFile = (path: string, contents: string) =>
  invoke<void>("write_text_file", { path, contents });

export const saveBatchManifest = (manifest: BatchManifest) =>
  invoke<void>("save_batch_manifest", { manifest });
export const listBatchManifests = () =>
  invoke<BatchManifest[]>("list_batch_manifests");

export const listModelFiles = (modelsDir: string) =>
  invoke<ModelFile[]>("list_model_files", { modelsDir });

export const allowAssetDirs = (dirs: string[]) =>
  invoke<void>("allow_asset_dirs", { dirs });

export type LaunchResult =
  | "already_running"
  | "already_launching"
  | "launching";

export const comfyLaunch = (comfyRoot: string, host: string, port: number) =>
  invoke<LaunchResult>("comfy_launch", { comfyRoot, host, port });
