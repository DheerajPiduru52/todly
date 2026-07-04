import { create } from "zustand";
import type { Preset, TodlyConfig } from "../types";
import * as tauri from "../api/tauri";
import {
  getObjectInfo,
  getSystemStats,
  setComfyAddress,
  type ObjectInfoNode,
} from "../api/comfy";
import { comfyWs } from "../api/ws";
import { attachGenerationListeners } from "./generation";
import { useLaunch } from "./launch";

export type Tab =
  | "generate"
  | "gallery"
  | "queue"
  | "presets"
  | "batch"
  | "models"
  | "settings";

interface AppState {
  tab: Tab;
  config: TodlyConfig | null;
  connected: boolean;
  comfyVersion: string | null;
  objectInfo: Record<string, ObjectInfoNode> | null;
  presets: Preset[];
  activePresetId: string | null;
  initError: string | null;

  setTab: (t: Tab) => void;
  init: () => Promise<void>;
  reloadPresets: () => Promise<void>;
  refreshObjectInfo: () => Promise<void>;
  setActivePreset: (id: string) => void;
  saveConfig: (c: TodlyConfig) => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  tab: "generate",
  config: null,
  connected: false,
  comfyVersion: null,
  objectInfo: null,
  presets: [],
  activePresetId: null,
  initError: null,

  setTab: (tab) => set({ tab }),

  init: async () => {
    try {
      const config = await tauri.getConfig();
      setComfyAddress(config.comfyHost, config.comfyPort);
      const configured = config.comfyRoot.trim().length > 0;
      set({ config, tab: configured ? "generate" : "settings" });

      if (configured) {
        await tauri
          .allowAssetDirs([config.outputDir, `${config.comfyRoot}\\temp`])
          .catch(() => {});
      }

      comfyWs.onStatus((connected) => {
        set({ connected });
        if (connected) {
          // refresh version + node info whenever the server (re)appears
          getSystemStats()
            .then((s) => set({ comfyVersion: s.system.comfyui_version }))
            .catch(() => {});
          get().refreshObjectInfo();
          useLaunch.getState().markConnected();
        }
      });
      attachGenerationListeners();
      await comfyWs.connect();

      if (config.autoLaunchComfy) {
        void useLaunch
          .getState()
          .start(config.comfyRoot, config.comfyHost, config.comfyPort);
      }

      const presets = await tauri.listPresets();
      const activePresetId =
        presets.find((p) => p.id === config.defaultPresetId)?.id ??
        presets[0]?.id ??
        null;
      set({ presets, activePresetId });
    } catch (e) {
      set({ initError: String(e) });
    }
  },

  reloadPresets: async () => {
    const presets = await tauri.listPresets();
    const { activePresetId } = get();
    set({
      presets,
      activePresetId: presets.find((p) => p.id === activePresetId)
        ? activePresetId
        : (presets[0]?.id ?? null),
    });
  },

  refreshObjectInfo: async () => {
    try {
      const objectInfo = await getObjectInfo();
      set({ objectInfo });
    } catch {
      /* server offline — keep stale info */
    }
  },

  setActivePreset: (id) => set({ activePresetId: id }),

  saveConfig: async (c) => {
    await tauri.saveConfig(c);
    setComfyAddress(c.comfyHost, c.comfyPort);
    set({ config: c });
    if (c.comfyRoot.trim().length > 0) {
      await tauri
        .allowAssetDirs([c.outputDir, `${c.comfyRoot}\\temp`])
        .catch(() => {});
    }
    await comfyWs.connect(); // reconnect to (possibly) new address
  },
}));

export function activePreset(state: {
  presets: Preset[];
  activePresetId: string | null;
}): Preset | null {
  return state.presets.find((p) => p.id === state.activePresetId) ?? null;
}
