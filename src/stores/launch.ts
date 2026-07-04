import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { comfyLaunch } from "../api/tauri";

export type BootStatus = "idle" | "launching" | "booting" | "ready" | "error";

interface LaunchState {
  status: BootStatus;
  startedAt: number | null;
  log: string[];
  error: string | null;

  ensureListeners: () => Promise<void>;
  start: (comfyRoot: string, host: string, port: number) => Promise<void>;
  markConnected: () => void;
  reset: () => void;
}

let listenersReady = false;

export const useLaunch = create<LaunchState>((set, get) => ({
  status: "idle",
  startedAt: null,
  log: [],
  error: null,

  ensureListeners: async () => {
    if (listenersReady) return;
    listenersReady = true;
    await listen<string>("comfy-boot-log", (e) => {
      set((s) => ({ log: [...s.log, e.payload].slice(-300) }));
    });
    await listen<number | null>("comfy-boot-exit", (e) => {
      const s = get().status;
      if (s === "launching" || s === "booting") {
        set({
          status: "error",
          error:
            e.payload == null
              ? "ComfyUI exited before it finished starting up — see the log below."
              : `ComfyUI exited with code ${e.payload} before it finished starting up — see the log below.`,
        });
      }
    });
  },

  start: async (comfyRoot, host, port) => {
    await get().ensureListeners();
    if (get().status === "launching" || get().status === "booting") return;
    set({ status: "launching", error: null, log: [], startedAt: Date.now() });
    try {
      const result = await comfyLaunch(comfyRoot, host, port);
      if (result === "already_running") {
        set({ status: "ready" });
      } else {
        set({ status: "booting" });
      }
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  markConnected: () => {
    if (get().status !== "idle") set({ status: "ready" });
  },

  reset: () => set({ status: "idle", error: null }),
}));
