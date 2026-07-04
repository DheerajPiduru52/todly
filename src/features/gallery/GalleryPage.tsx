import { useEffect, useMemo, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useApp } from "../../stores/app";
import { submitWorkflow, useGeneration } from "../../stores/generation";
import * as tauri from "../../api/tauri";
import { fileSrc } from "../../lib/img";
import { parseWorkflowMeta, primaryPrompt } from "../../lib/metadata";
import { randomSeed } from "../../lib/preset";
import {
  Button,
  EmptyState,
  Modal,
  Select,
  TextInput,
  formatBytes,
} from "../../components/ui";
import type {
  BatchManifest,
  GalleryItem,
  ParsedImageMeta,
  WorkflowJson,
} from "../../types";

export default function GalleryPage() {
  const config = useApp((s) => s.config);
  const setTab = useApp((s) => s.setTab);
  const galleryVersion = useGeneration((s) => s.galleryVersion);

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [manifests, setManifests] = useState<BatchManifest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [selected, setSelected] = useState<GalleryItem | null>(null);

  useEffect(() => {
    if (!config) return;
    tauri
      .listGallery(config.outputDir)
      .then((list) => {
        setItems(list);
        setError(null);
      })
      .catch((e) => setError(String(e)));
    tauri.listBatchManifests().then(setManifests).catch(() => {});
  }, [config, galleryVersion]);

  /** filename -> batch name */
  const batchByFile = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const m of manifests) {
      for (const it of m.items) {
        for (const img of it.images) {
          map.set(img.filename, { id: m.id, name: m.name });
        }
      }
    }
    return map;
  }, [manifests]);

  const filtered = items.filter((it) => {
    if (search && !it.fileName.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (batchFilter !== "all") {
      const b = batchByFile.get(it.fileName);
      if (batchFilter === "none") return !b;
      return b?.id === batchFilter;
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Gallery</h1>
        <span className="text-xs text-ink-400">{filtered.length} images</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-56">
            <TextInput
              placeholder="Search filename…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-56">
            <Select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              options={[
                { value: "all", label: "All images" },
                { value: "none", label: "Not from a batch" },
                ...manifests.map((m) => ({ value: m.id, label: `Batch: ${m.name}` })),
              ]}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          {error} — check the output folder in{" "}
          <button className="underline cursor-pointer" onClick={() => setTab("settings")}>
            Settings
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon="▦"
          title="No images yet"
          hint="Generated images land here automatically."
        />
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 overflow-y-auto pb-4">
          {filtered.map((it) => {
            const batch = batchByFile.get(it.fileName);
            return (
              <button
                key={it.path}
                onClick={() => setSelected(it)}
                className="group relative aspect-square overflow-hidden rounded-xl border border-ink-800 bg-ink-900 cursor-pointer"
              >
                <img
                  src={fileSrc(it.path)}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                {batch && (
                  <span className="absolute left-2 top-2 rounded-md bg-accent-600/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {batch.name}
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-5 text-left text-[10px] text-ink-200 opacity-0 transition-opacity group-hover:opacity-100">
                  {it.fileName}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ImageModal
        item={selected}
        batch={selected ? batchByFile.get(selected.fileName)?.name : undefined}
        onClose={() => setSelected(null)}
        onDeleted={(path) => {
          setItems((prev) => prev.filter((i) => i.path !== path));
          setSelected(null);
        }}
      />
    </div>
  );
}

function ImageModal({
  item,
  batch,
  onClose,
  onDeleted,
}: {
  item: GalleryItem | null;
  batch?: string;
  onClose: () => void;
  onDeleted: (path: string) => void;
}) {
  const config = useApp((s) => s.config);
  const connected = useApp((s) => s.connected);
  const setTab = useApp((s) => s.setTab);
  const [meta, setMeta] = useState<ParsedImageMeta | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setMeta(null);
    setStatus(null);
    setConfirmDelete(false);
    if (!item) return;
    tauri
      .readImageMetadata(item.path)
      .then((m) => setMeta(m.prompt ? parseWorkflowMeta(m.prompt) : null))
      .catch(() => setMeta(null));
  }, [item?.path]);

  if (!item) return null;

  async function regenerate(newSeed: boolean) {
    if (!meta?.raw) return;
    const wf: WorkflowJson = JSON.parse(JSON.stringify(meta.raw));
    let seed = meta.seed ?? null;
    if (newSeed) {
      seed = randomSeed();
      for (const node of Object.values(wf)) {
        if (node.class_type === "KSampler" || node.class_type === "KSamplerAdvanced") {
          if ("seed" in node.inputs) node.inputs.seed = seed;
          if ("noise_seed" in node.inputs) node.inputs.noise_seed = seed;
        }
      }
    }
    try {
      await submitWorkflow(wf, {
        presetName: "regenerate",
        prompt: primaryPrompt(meta) ?? item!.fileName,
        seed,
      });
      setStatus("Queued ✓ — check the Generate or Queue tab");
      setTab("generate");
    } catch (e) {
      setStatus(`Failed: ${e}`);
    }
  }

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex gap-6">
        <div className="flex min-h-[420px] flex-1 items-center justify-center">
          <img
            src={fileSrc(item.path)}
            className="max-h-[76vh] max-w-full rounded-xl object-contain"
          />
        </div>
        <div className="flex w-80 shrink-0 flex-col gap-3 text-sm">
          <div>
            <div className="font-semibold break-all">{item.fileName}</div>
            <div className="mt-1 text-xs text-ink-400">
              {formatBytes(item.size)} ·{" "}
              {new Date(item.modifiedMs).toLocaleString()}
              {batch && (
                <span className="ml-2 rounded bg-accent-600/25 px-1.5 py-0.5 text-[10px] text-accent-300">
                  {batch}
                </span>
              )}
            </div>
          </div>

          {meta ? (
            <div className="space-y-2 overflow-y-auto rounded-xl bg-ink-900/70 p-3 text-xs">
              {meta.texts[0] && (
                <div>
                  <div className="mb-1 font-semibold text-ink-300">Prompt</div>
                  <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-ink-200">
                    {meta.texts[0].text}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-ink-300">
                {meta.seed !== undefined && <Fact k="Seed" v={String(meta.seed)} />}
                {meta.steps !== undefined && <Fact k="Steps" v={String(meta.steps)} />}
                {meta.cfg !== undefined && <Fact k="CFG" v={String(meta.cfg)} />}
                {meta.sampler && <Fact k="Sampler" v={meta.sampler} />}
                {meta.scheduler && <Fact k="Scheduler" v={meta.scheduler} />}
              </div>
              {meta.models.length > 0 && (
                <Fact k="Model" v={meta.models.join(", ")} block />
              )}
              {meta.loras.length > 0 && (
                <Fact
                  k="LoRA"
                  v={meta.loras
                    .map((l) => `${l.name}${l.strength != null ? ` @ ${l.strength}` : ""}`)
                    .join(", ")}
                  block
                />
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-ink-900/70 p-3 text-xs text-ink-400">
              No embedded generation metadata found in this file.
            </div>
          )}

          <div className="mt-auto space-y-2">
            {meta?.raw && (
              <>
                <Button
                  className="w-full"
                  disabled={!connected}
                  onClick={() => regenerate(false)}
                >
                  ↺ Regenerate (same seed)
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={!connected}
                  onClick={() => regenerate(true)}
                >
                  ⚄ Regenerate (new seed)
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => revealItemInDir(item.path)}
            >
              Open in Explorer
            </Button>
            {confirmDelete ? (
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={async () => {
                    if (!config) return;
                    try {
                      await tauri.deleteImage(item.path, config.outputDir);
                      onDeleted(item.path);
                    } catch (e) {
                      setStatus(`Delete failed: ${e}`);
                    }
                  }}
                >
                  Confirm delete
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </Button>
              </div>
            ) : (
              <Button
                variant="danger"
                className="w-full"
                onClick={() => setConfirmDelete(true)}
              >
                Delete image
              </Button>
            )}
            {status && <div className="text-xs text-ink-300">{status}</div>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Fact({ k, v, block }: { k: string; v: string; block?: boolean }) {
  return (
    <div className={block ? "col-span-2" : "contents"}>
      <span className="text-ink-400">{k}: </span>
      <span className="break-all text-ink-200">{v}</span>
    </div>
  );
}
