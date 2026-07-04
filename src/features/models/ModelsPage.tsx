import { useEffect, useMemo, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useApp } from "../../stores/app";
import * as tauri from "../../api/tauri";
import { Button, Card, EmptyState, Label, TextInput, formatBytes } from "../../components/ui";
import type { ModelFile } from "../../types";

const FOLDER_LABELS: Record<string, string> = {
  checkpoints: "Checkpoints",
  diffusion_models: "Diffusion models (UNET)",
  loras: "LoRAs",
  vae: "VAE",
  text_encoders: "Text encoders",
  clip: "CLIP",
  embeddings: "Embeddings",
  controlnet: "ControlNet",
  upscale_models: "Upscalers",
};

export default function ModelsPage() {
  const { config, refreshObjectInfo, connected } = useApp();
  const [files, setFiles] = useState<ModelFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!config) return;
    tauri
      .listModelFiles(config.modelsDir)
      .then((f) => {
        setFiles(f);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [config]);

  const groups = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q
      ? files.filter((f) => f.name.toLowerCase().includes(q))
      : files;
    const map = new Map<string, ModelFile[]>();
    for (const f of filtered) {
      if (!map.has(f.folder)) map.set(f.folder, []);
      map.get(f.folder)!.push(f);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [files, search]);

  const totalBytes = files.reduce((a, f) => a + f.size, 0);

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Models</h1>
        <span className="text-xs text-ink-400">
          {files.length} files · {formatBytes(totalBytes)} on disk
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-64">
            <TextInput
              placeholder="Search models…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="ghost"
            disabled={!connected || refreshing}
            onClick={async () => {
              setRefreshing(true);
              await refreshObjectInfo();
              if (config) {
                await tauri.listModelFiles(config.modelsDir).then(setFiles).catch(() => {});
              }
              setRefreshing(false);
            }}
          >
            ⟳ Refresh lists
          </Button>
        </div>
      </div>

      <Card className="mb-4 border-dashed !border-ink-600 bg-ink-900/40">
        <div className="flex items-center gap-4">
          <div className="text-2xl">⬇</div>
          <div className="flex-1">
            <div className="text-sm font-medium text-ink-200">
              Model downloader — coming after the core flow is confirmed
            </div>
            <div className="mt-0.5 text-xs text-ink-400">
              Planned: paste a direct URL (Hugging Face / Civitai), search via their APIs
              with previews, auto-sort into the right ComfyUI folder, checksum + free-space
              checks. New files already appear in dropdowns after “Refresh lists”.
            </div>
          </div>
        </div>
      </Card>

      {error && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState icon="◍" title="No model files found" />
      ) : (
        <div className="space-y-4 overflow-y-auto pb-4">
          {groups.map(([folder, list]) => (
            <Card key={folder}>
              <div className="mb-2 flex items-baseline gap-2">
                <Label>{FOLDER_LABELS[folder] ?? folder}</Label>
                <span className="text-[10px] text-ink-400">
                  {list.length} · {formatBytes(list.reduce((a, f) => a + f.size, 0))}
                </span>
              </div>
              <div className="divide-y divide-ink-800">
                {list.map((f) => (
                  <div key={`${f.folder}/${f.name}`} className="flex items-center gap-3 py-1.5">
                    <span className="flex-1 truncate text-sm text-ink-200">{f.name}</span>
                    <span className="shrink-0 text-xs text-ink-400">{formatBytes(f.size)}</span>
                    <button
                      className="shrink-0 text-xs text-ink-400 hover:text-ink-100 cursor-pointer"
                      title="Show in Explorer"
                      onClick={() =>
                        config &&
                        revealItemInDir(`${config.modelsDir}\\${f.folder}\\${f.name.replace(/\//g, "\\")}`)
                      }
                    >
                      ⧉
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
