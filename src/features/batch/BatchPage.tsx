import { useEffect, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { activePreset, useApp } from "../../stores/app";
import { batchEtaMs, formatEta, useBatch, type SeedMode } from "../../stores/batch";
import { useGeneration } from "../../stores/generation";
import { parseBracketPrompts } from "../../lib/parseBatch";
import * as tauri from "../../api/tauri";
import {
  Button,
  Card,
  EmptyState,
  Label,
  NumberInput,
  ProgressBar,
  Select,
  TextArea,
  TextInput,
} from "../../components/ui";
import type { BatchItem, BatchManifest } from "../../types";

export default function BatchPage() {
  const { presets, activePresetId, setActivePreset, connected } = useApp();
  const preset = activePreset({ presets, activePresetId });
  const batch = useBatch();
  const jobs = useGeneration((s) => s.jobs);
  const [pasteText, setPasteText] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);

  async function importTxt() {
    const file = await openDialog({
      title: "Import prompts (.txt with [bracketed] prompts)",
      filters: [{ name: "Text", extensions: ["txt"] }],
      multiple: false,
    });
    if (!file) return;
    const raw = await tauri.readTextFile(file as string);
    const { prompts, warnings } = parseBracketPrompts(raw);
    batch.addPrompts(prompts, warnings);
  }

  function parsePasted() {
    const { prompts, warnings } = parseBracketPrompts(pasteText);
    batch.addPrompts(prompts, warnings);
    if (prompts.length > 0) {
      setPasteText("");
      setPasteOpen(false);
    }
  }

  const doneCount = batch.items.filter((i) => i.status === "done").length;
  const failCount = batch.items.filter(
    (i) => i.status === "error" || i.status === "cancelled",
  ).length;
  const eta = batch.running ? batchEtaMs(batch.items) : null;

  return (
    <div className="flex h-full gap-5 p-5">
      {/* left: setup + controls */}
      <div className="flex w-96 shrink-0 flex-col gap-4 overflow-y-auto pr-1">
        <Card className="space-y-4">
          <div>
            <Label>Preset for the whole batch</Label>
            <Select
              value={preset?.id ?? ""}
              disabled={batch.running}
              onChange={(e) => setActivePreset(e.target.value)}
              options={presets.map((p) => ({ value: p.id, label: p.name }))}
            />
            <div className="mt-1 text-[11px] text-ink-400">
              Prompts vary per job; every other setting comes from this preset's saved
              defaults.
            </div>
          </div>

          <div>
            <Label>Batch name</Label>
            <TextInput
              placeholder="e.g. berry-card-art-v1"
              value={batch.name}
              disabled={batch.running}
              onChange={(e) => batch.setName(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label>Seed</Label>
              <Select
                value={batch.seedMode}
                disabled={batch.running}
                onChange={(e) => batch.setSeedMode(e.target.value as SeedMode)}
                options={[
                  { value: "random", label: "Random per prompt" },
                  { value: "fixed", label: "Fixed for all" },
                  { value: "increment", label: "Fixed + increment" },
                ]}
              />
            </div>
            {batch.seedMode !== "random" && (
              <div className="w-32">
                <Label>Base seed</Label>
                <NumberInput
                  value={batch.fixedSeed}
                  min={0}
                  disabled={batch.running}
                  onValue={batch.setFixedSeed}
                />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={batch.running} onClick={importTxt}>
              📄 Import .txt
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              disabled={batch.running}
              onClick={() => setPasteOpen(!pasteOpen)}
            >
              ✎ Paste text
            </Button>
          </div>

          {pasteOpen && (
            <div className="space-y-2">
              <TextArea
                rows={5}
                placeholder="[a knight standing in a storm] [a red dragon curled on gold coins]"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <Button variant="ghost" className="w-full" onClick={parsePasted}>
                Parse brackets → add to list
              </Button>
            </div>
          )}

          {batch.warnings.length > 0 && (
            <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200">
              {batch.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
              <button
                className="text-amber-400 underline cursor-pointer"
                onClick={batch.clearWarnings}
              >
                dismiss
              </button>
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          {batch.running ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {batch.paused ? "Paused" : "Running"} · {doneCount}/{batch.items.length}
                </span>
                <span className="text-xs text-ink-400">ETA {formatEta(eta)}</span>
              </div>
              <ProgressBar value={doneCount + failCount} max={batch.items.length} />
              <div className="flex gap-2">
                {batch.paused ? (
                  <Button className="flex-1" onClick={batch.resume}>
                    ▶ Resume
                  </Button>
                ) : (
                  <Button variant="ghost" className="flex-1" onClick={batch.pause}>
                    ⏸ Pause after current
                  </Button>
                )}
                <Button variant="danger" className="flex-1" onClick={() => void batch.cancel()}>
                  ■ Cancel batch
                </Button>
              </div>
            </>
          ) : (
            <Button
              className="w-full py-3"
              disabled={!connected || !preset || batch.items.length === 0}
              onClick={() => preset && void batch.start(preset)}
            >
              ⧉ Run batch ({batch.items.length} prompt
              {batch.items.length === 1 ? "" : "s"})
            </Button>
          )}
          {!batch.running && batch.items.some((i) => i.status !== "pending") && (
            <ExportButtons items={batch.items} />
          )}
        </Card>

        <PastBatches />
      </div>

      {/* right: prompt list */}
      <Card className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between">
          <Label>Prompts ({batch.items.length})</Label>
          {batch.items.length > 0 && !batch.running && (
            <Button variant="subtle" className="!px-2 !py-1 text-xs" onClick={batch.clearItems}>
              Clear all
            </Button>
          )}
        </div>
        {batch.items.length === 0 ? (
          <EmptyState
            icon="⧉"
            title="No prompts loaded"
            hint="Import a .txt file where each prompt is wrapped in [square brackets], or paste text on the left."
          />
        ) : (
          <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
            {batch.items.map((it) => {
              const job = it.promptId ? jobs[it.promptId] : undefined;
              return (
                <div
                  key={it.index}
                  className={`flex items-start gap-2 rounded-xl border p-2.5 ${
                    it.status === "running"
                      ? "border-accent-500/50 bg-accent-500/5"
                      : "border-ink-800 bg-ink-900/50"
                  }`}
                >
                  <span className="mt-1.5 w-7 shrink-0 text-center text-xs text-ink-400">
                    {it.index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <TextArea
                      rows={Math.min(4, Math.max(1, Math.ceil(it.prompt.length / 70)))}
                      className="!border-transparent !bg-transparent !p-1 focus:!border-ink-700"
                      value={it.prompt}
                      disabled={batch.running}
                      onChange={(e) => batch.updatePrompt(it.index, e.target.value)}
                    />
                    {it.status === "running" && (
                      <div className="mt-1.5 px-1">
                        <ProgressBar
                          value={job?.progress?.value ?? 0}
                          max={job?.progress?.max ?? 1}
                          indeterminate={!job?.progress}
                        />
                      </div>
                    )}
                    {it.error && (
                      <div className="mt-1 px-1 text-[11px] text-red-400">{it.error}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 pt-1">
                    <StatusDot status={it.status} />
                    {!batch.running && (
                      <>
                        <IconBtn label="↑" onClick={() => batch.moveItem(it.index, -1)} />
                        <IconBtn label="↓" onClick={() => batch.moveItem(it.index, 1)} />
                        <IconBtn label="✕" onClick={() => batch.removeItem(it.index)} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusDot({ status }: { status: BatchItem["status"] }) {
  const map: Record<string, string> = {
    pending: "bg-ink-600",
    running: "bg-glow animate-pulse",
    done: "bg-emerald-400",
    error: "bg-red-400",
    cancelled: "bg-amber-400",
  };
  return <span title={status} className={`h-2.5 w-2.5 rounded-full ${map[status]}`} />;
}

function IconBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-1.5 py-0.5 text-xs text-ink-400 hover:bg-ink-700 hover:text-ink-100 cursor-pointer"
    >
      {label}
    </button>
  );
}

function toCsv(items: BatchManifest["items"]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    "index,prompt,seed,status,files",
    ...items.map((it) =>
      [
        it.index + 1,
        esc(it.prompt),
        it.seed ?? "",
        it.status,
        esc(it.images.map((im) => im.filename).join("; ")),
      ].join(","),
    ),
  ];
  return rows.join("\r\n");
}

function ExportButtons({ items }: { items: BatchItem[] }) {
  const batch = useBatch();
  async function exportAs(kind: "csv" | "json") {
    const path = await saveDialog({
      title: `Export batch manifest (${kind.toUpperCase()})`,
      defaultPath: `${batch.name || "batch"}.${kind}`,
      filters: [{ name: kind.toUpperCase(), extensions: [kind] }],
    });
    if (!path) return;
    const manifest = items.map((it) => ({
      index: it.index,
      prompt: it.prompt,
      seed: it.seed,
      status: it.status,
      images: it.images,
    }));
    const contents =
      kind === "csv" ? toCsv(manifest) : JSON.stringify(manifest, null, 2);
    await tauri.writeTextFile(path, contents);
  }
  return (
    <div className="flex gap-2">
      <Button variant="ghost" className="flex-1 text-xs" onClick={() => exportAs("csv")}>
        Export CSV
      </Button>
      <Button variant="ghost" className="flex-1 text-xs" onClick={() => exportAs("json")}>
        Export JSON
      </Button>
    </div>
  );
}

function PastBatches() {
  const [manifests, setManifests] = useState<BatchManifest[]>([]);
  const running = useBatch((s) => s.running);
  useEffect(() => {
    if (running) return; // refresh once each run finishes
    tauri.listBatchManifests().then(setManifests).catch(() => {});
  }, [running]);
  if (manifests.length === 0) return null;
  return (
    <Card>
      <Label>Past batches</Label>
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {manifests.map((m) => (
          <div key={m.id} className="flex items-center gap-2 text-xs">
            <div className="min-w-0 flex-1">
              <div className="truncate text-ink-200">{m.name}</div>
              <div className="text-[10px] text-ink-400">
                {new Date(m.createdAt).toLocaleString()} · {m.items.length} prompts ·{" "}
                {m.presetName}
              </div>
            </div>
            <Button
              variant="subtle"
              className="!px-2 !py-1 text-[11px]"
              onClick={async () => {
                const path = await saveDialog({
                  defaultPath: `${m.name}.csv`,
                  filters: [{ name: "CSV", extensions: ["csv"] }],
                });
                if (path) await tauri.writeTextFile(path, toCsv(m.items));
              }}
            >
              CSV
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
