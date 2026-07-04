import { create } from "zustand";
import type { BatchItem, BatchManifest, Preset } from "../types";
import { buildWorkflow, randomSeed } from "../lib/preset";
import {
  averageJobDurationMs,
  awaitCompletion,
  submitWorkflow,
  useGeneration,
} from "./generation";
import { interrupt } from "../api/comfy";
import { saveBatchManifest } from "../api/tauri";

export type SeedMode = "random" | "fixed" | "increment";

interface BatchState {
  items: BatchItem[];
  warnings: string[];
  name: string;
  seedMode: SeedMode;
  fixedSeed: number;
  running: boolean;
  paused: boolean;
  cancelRequested: boolean;
  currentIndex: number | null;
  batchId: string | null;

  setItems: (items: BatchItem[]) => void;
  addPrompts: (prompts: string[], warnings: string[]) => void;
  updatePrompt: (index: number, prompt: string) => void;
  removeItem: (index: number) => void;
  moveItem: (index: number, dir: -1 | 1) => void;
  clearItems: () => void;
  clearWarnings: () => void;
  setName: (name: string) => void;
  setSeedMode: (m: SeedMode) => void;
  setFixedSeed: (s: number) => void;

  start: (preset: Preset) => Promise<void>;
  pause: () => void;
  resume: () => void;
  cancel: () => Promise<void>;
}

function newItems(prompts: string[], startIndex: number): BatchItem[] {
  return prompts.map((prompt, i) => ({
    index: startIndex + i,
    prompt,
    seed: null,
    status: "pending" as const,
    images: [],
  }));
}

function reindex(items: BatchItem[]): BatchItem[] {
  return items.map((it, i) => ({ ...it, index: i }));
}

export const useBatch = create<BatchState>((set, get) => ({
  items: [],
  warnings: [],
  name: "",
  seedMode: "random",
  fixedSeed: 12345,
  running: false,
  paused: false,
  cancelRequested: false,
  currentIndex: null,
  batchId: null,

  setItems: (items) => set({ items: reindex(items) }),
  addPrompts: (prompts, warnings) =>
    set((s) => ({
      items: [...s.items, ...newItems(prompts, s.items.length)],
      warnings: [...s.warnings, ...warnings],
    })),
  updatePrompt: (index, prompt) =>
    set((s) => ({
      items: s.items.map((it) => (it.index === index ? { ...it, prompt } : it)),
    })),
  removeItem: (index) =>
    set((s) => ({ items: reindex(s.items.filter((it) => it.index !== index)) })),
  moveItem: (index, dir) =>
    set((s) => {
      const items = [...s.items];
      const j = index + dir;
      if (j < 0 || j >= items.length) return s;
      [items[index], items[j]] = [items[j], items[index]];
      return { items: reindex(items) };
    }),
  clearItems: () => set({ items: [], warnings: [], currentIndex: null }),
  clearWarnings: () => set({ warnings: [] }),
  setName: (name) => set({ name }),
  setSeedMode: (seedMode) => set({ seedMode }),
  setFixedSeed: (fixedSeed) => set({ fixedSeed }),

  start: async (preset) => {
    const state = get();
    if (state.running || state.items.length === 0) return;

    const stamp = new Date();
    const batchId = `batch-${stamp.toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;
    const name =
      state.name.trim() ||
      `Batch ${stamp.toLocaleDateString()} ${stamp.toLocaleTimeString()}`;

    // reset any previous run state on the items
    set({
      running: true,
      paused: false,
      cancelRequested: false,
      batchId,
      name,
      items: state.items.map((it) => ({
        ...it,
        status: "pending" as const,
        images: [],
        promptId: undefined,
        durationMs: undefined,
        error: undefined,
      })),
    });

    const persist = async () => {
      const s = get();
      const manifest: BatchManifest = {
        id: batchId,
        name: s.name,
        presetId: preset.id,
        presetName: preset.name,
        createdAt: stamp.toISOString(),
        items: s.items.map((it) => ({
          index: it.index,
          prompt: it.prompt,
          seed: it.seed,
          status: it.status,
          images: it.images,
        })),
      };
      try {
        await saveBatchManifest(manifest);
      } catch (e) {
        console.error("manifest save failed", e);
      }
    };

    for (let i = 0; i < get().items.length; i++) {
      // pause gate — wait here until resumed or cancelled
      while (get().paused && !get().cancelRequested) {
        await new Promise((r) => setTimeout(r, 300));
      }
      if (get().cancelRequested) {
        set((s) => ({
          items: s.items.map((it) =>
            it.status === "pending" ? { ...it, status: "cancelled" as const } : it,
          ),
        }));
        break;
      }

      const item = get().items[i];
      const { seedMode, fixedSeed } = get();
      const seed =
        seedMode === "random"
          ? randomSeed()
          : seedMode === "fixed"
            ? fixedSeed
            : fixedSeed + i;

      set({ currentIndex: i });
      const patch = (p: Partial<BatchItem>) =>
        set((s) => ({
          items: s.items.map((it) => (it.index === i ? { ...it, ...p } : it)),
        }));

      const started = Date.now();
      try {
        const workflow = buildWorkflow(preset, { prompt: item.prompt, seed });
        const promptId = await submitWorkflow(workflow, {
          presetName: preset.name,
          prompt: item.prompt,
          seed,
          batchId,
        });
        patch({ status: "running", promptId, seed });
        const status = await awaitCompletion(promptId);
        const job = useGeneration.getState().jobs[promptId];
        patch({
          status,
          images: job?.images ?? [],
          durationMs: Date.now() - started,
          error: job?.error,
        });
      } catch (e) {
        patch({ status: "error", error: String(e), durationMs: Date.now() - started });
      }
      await persist();
    }

    set({ running: false, paused: false, currentIndex: null });
    await persist();
  },

  pause: () => set({ paused: true }),
  resume: () => set({ paused: false }),

  cancel: async () => {
    set({ cancelRequested: true, paused: false });
    try {
      await interrupt(); // stop the currently rendering item
    } catch {
      /* server may be offline */
    }
  },
}));

/** Estimated ms remaining for the current run, if we have any timing data. */
export function batchEtaMs(items: BatchItem[]): number | null {
  const remaining = items.filter(
    (it) => it.status === "pending" || it.status === "running",
  ).length;
  if (remaining === 0) return 0;
  const timed = items.filter((it) => it.durationMs);
  const avg =
    timed.length > 0
      ? timed.reduce((a, it) => a + (it.durationMs ?? 0), 0) / timed.length
      : averageJobDurationMs();
  return avg ? Math.round(avg * remaining) : null;
}

export function formatEta(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000) return `~${Math.max(1, Math.round(ms / 1000))}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `~${m}m ${s}s`;
}
