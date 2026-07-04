import { useEffect, useMemo, useState } from "react";
import { activePreset, useApp } from "../../stores/app";
import { submitWorkflow, useGeneration } from "../../stores/generation";
import {
  buildWorkflow,
  mappedValue,
  randomSeed,
  type GenerationValues,
} from "../../lib/preset";
import { comboOptions } from "../../api/comfy";
import { imageRefSrc } from "../../lib/img";
import {
  Button,
  Card,
  Collapsible,
  EmptyState,
  Label,
  NumberInput,
  Pill,
  ProgressBar,
  Select,
  TextArea,
  Toggle,
} from "../../components/ui";
import type { Preset } from "../../types";

export default function GeneratePage() {
  const { presets, activePresetId, setActivePreset, objectInfo, connected, config } =
    useApp();
  const preset = activePreset({ presets, activePresetId });

  const [values, setValues] = useState<GenerationValues>({});
  const [lockSeed, setLockSeed] = useState(false);
  const [seed, setSeed] = useState<number>(randomSeed());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPromptId, setLastPromptId] = useState<string | null>(null);

  // reset form values from the preset's saved defaults whenever preset changes
  useEffect(() => {
    if (!preset) return;
    const f = preset.fields;
    const v: GenerationValues = {
      prompt: str(mappedValue(preset, f.prompt)) ?? "",
      negative: str(mappedValue(preset, f.negative)),
      steps: num(mappedValue(preset, f.steps)),
      cfg: num(mappedValue(preset, f.cfg)),
      sampler: str(mappedValue(preset, f.sampler)),
      scheduler: str(mappedValue(preset, f.scheduler)),
      width: num(mappedValue(preset, f.width)),
      height: num(mappedValue(preset, f.height)),
      aspectRatio: str(mappedValue(preset, f.aspectRatio)),
      megapixels: num(mappedValue(preset, f.megapixels)),
      model: str(mappedValue(preset, f.model)),
      toggles: Object.fromEntries(
        (preset.toggles ?? []).map((t) => [
          t.key,
          Boolean(mappedValue(preset, t.ref) ?? t.default ?? false),
        ]),
      ),
      loras: (preset.loras ?? []).map((l) => ({
        name: str(mappedValue(preset, l.nameRef)),
        strength: l.strengthRef ? num(mappedValue(preset, l.strengthRef)) : undefined,
      })),
    };
    setValues(v);
    // fresh prompt box: don't carry the workflow's saved example prompt
    setValues((prev) => ({ ...prev, prompt: "" }));
  }, [preset?.id]);

  const options = (field: keyof Preset["fields"]) => {
    if (!preset) return null;
    const ref = preset.fields[field];
    if (!ref) return null;
    const classType = preset.workflow[ref.node]?.class_type;
    return classType ? comboOptions(objectInfo, classType, ref.input) : null;
  };

  const loraOptions = useMemo(() => {
    if (!preset?.loras?.length) return null;
    const ref = preset.loras[0].nameRef;
    const classType = preset.workflow[ref.node]?.class_type;
    return classType ? comboOptions(objectInfo, classType, "lora_name") : null;
  }, [preset, objectInfo]);

  const job = useGeneration((s) =>
    lastPromptId ? (s.jobs[lastPromptId] ?? null) : null,
  );
  const previewUrl = useGeneration((s) => s.previewUrl);
  const order = useGeneration((s) => s.order);
  const jobs = useGeneration((s) => s.jobs);
  const recent = order
    .map((id) => jobs[id])
    .filter((j) => j && j.images.length > 0)
    .slice(0, 12);

  async function generate() {
    if (!preset) return;
    setError(null);
    setSubmitting(true);
    try {
      const usedSeed = lockSeed ? seed : randomSeed();
      if (!lockSeed) setSeed(usedSeed);
      const workflow = buildWorkflow(preset, { ...values, seed: usedSeed });
      const id = await submitWorkflow(workflow, {
        presetName: preset.name,
        prompt: values.prompt ?? "",
        seed: usedSeed,
      });
      setLastPromptId(id);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!preset) {
    return (
      <EmptyState
        title="No presets yet"
        hint="Create one in the Presets tab by importing a ComfyUI workflow (Export → API format)."
      />
    );
  }

  const running = job && (job.status === "pending" || job.status === "running");
  const aspectOpts = options("aspectRatio");
  const samplerOpts = options("sampler");
  const schedulerOpts = options("scheduler");
  const modelOpts = options("model");

  return (
    <div className="flex h-full gap-5 p-5">
      {/* left: controls */}
      <div className="flex w-[440px] shrink-0 flex-col gap-4 overflow-y-auto pr-1">
        <Card className="space-y-4">
          <div>
            <Label>Preset</Label>
            <Select
              value={preset.id}
              onChange={(e) => setActivePreset(e.target.value)}
              options={presets.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>

          <div>
            <Label>Prompt</Label>
            <TextArea
              rows={6}
              placeholder="Describe the image you want…"
              value={values.prompt ?? ""}
              onChange={(e) => setValues({ ...values, prompt: e.target.value })}
            />
          </div>

          {preset.fields.negative && (
            <div>
              <Label>Negative prompt</Label>
              <TextArea
                rows={2}
                placeholder="What to avoid (optional)"
                value={values.negative ?? ""}
                onChange={(e) => setValues({ ...values, negative: e.target.value })}
              />
            </div>
          )}

          {aspectOpts && (
            <div>
              <Label>Aspect ratio</Label>
              <div className="flex flex-wrap gap-1.5">
                {aspectOpts.map((o) => (
                  <Pill
                    key={o}
                    active={values.aspectRatio === o}
                    onClick={() => setValues({ ...values, aspectRatio: o })}
                  >
                    {o.replace(/\s*\(.*\)/, "")}
                  </Pill>
                ))}
              </div>
            </div>
          )}

          {preset.fields.megapixels && (
            <div className="w-40">
              <Label>Megapixels</Label>
              <NumberInput
                step={0.1}
                min={0.1}
                max={16}
                value={values.megapixels ?? 1}
                onValue={(n) => setValues({ ...values, megapixels: n })}
              />
            </div>
          )}

          {preset.fields.width && preset.fields.height && (
            <div className="flex gap-3">
              <div className="flex-1">
                <Label>Width</Label>
                <NumberInput
                  step={8}
                  value={values.width ?? 1024}
                  onValue={(n) => setValues({ ...values, width: n })}
                />
              </div>
              <div className="flex-1">
                <Label>Height</Label>
                <NumberInput
                  step={8}
                  value={values.height ?? 1024}
                  onValue={(n) => setValues({ ...values, height: n })}
                />
              </div>
            </div>
          )}

          {modelOpts && (
            <div>
              <Label>Model</Label>
              <Select
                value={values.model ?? ""}
                onChange={(e) => setValues({ ...values, model: e.target.value })}
                options={modelOpts.map((m) => ({ value: m }))}
              />
            </div>
          )}

          {(preset.toggles ?? []).map((t) => (
            <Toggle
              key={t.key}
              label={t.label}
              checked={values.toggles?.[t.key] ?? false}
              onChange={(v) =>
                setValues({ ...values, toggles: { ...values.toggles, [t.key]: v } })
              }
            />
          ))}

          {(preset.loras ?? []).map((l, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-ink-700/60 p-3">
              <Label>{l.label}</Label>
              {loraOptions && (
                <Select
                  value={values.loras?.[i]?.name ?? ""}
                  onChange={(e) => {
                    const loras = [...(values.loras ?? [])];
                    loras[i] = { ...loras[i], name: e.target.value };
                    setValues({ ...values, loras });
                  }}
                  options={loraOptions.map((m) => ({ value: m }))}
                />
              )}
              {l.strengthRef && (
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={values.loras?.[i]?.strength ?? 1}
                    onChange={(e) => {
                      const loras = [...(values.loras ?? [])];
                      loras[i] = { ...loras[i], strength: Number(e.target.value) };
                      setValues({ ...values, loras });
                    }}
                    className="flex-1 accent-[var(--color-accent-500)]"
                  />
                  <span className="w-10 text-right text-xs text-ink-300">
                    {(values.loras?.[i]?.strength ?? 1).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          ))}

          <Collapsible title="Advanced">
            <div className="grid grid-cols-2 gap-3">
              {preset.fields.steps && (
                <div>
                  <Label>Steps</Label>
                  <NumberInput
                    min={1}
                    max={150}
                    value={values.steps ?? 8}
                    onValue={(n) => setValues({ ...values, steps: n })}
                  />
                </div>
              )}
              {preset.fields.cfg && (
                <div>
                  <Label>CFG</Label>
                  <NumberInput
                    step={0.1}
                    min={0}
                    max={30}
                    value={values.cfg ?? 1}
                    onValue={(n) => setValues({ ...values, cfg: n })}
                  />
                </div>
              )}
              {samplerOpts && (
                <div>
                  <Label>Sampler</Label>
                  <Select
                    value={values.sampler ?? ""}
                    onChange={(e) => setValues({ ...values, sampler: e.target.value })}
                    options={samplerOpts.map((s) => ({ value: s }))}
                  />
                </div>
              )}
              {schedulerOpts && (
                <div>
                  <Label>Scheduler</Label>
                  <Select
                    value={values.scheduler ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, scheduler: e.target.value })
                    }
                    options={schedulerOpts.map((s) => ({ value: s }))}
                  />
                </div>
              )}
              {preset.fields.seed && (
                <div className="col-span-2 space-y-2">
                  <Toggle checked={lockSeed} onChange={setLockSeed} label="Lock seed" />
                  {lockSeed && (
                    <NumberInput value={seed} onValue={setSeed} min={0} />
                  )}
                </div>
              )}
            </div>
          </Collapsible>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <Button
            className="w-full py-3 text-base"
            onClick={generate}
            disabled={!connected || submitting || !(values.prompt ?? "").trim()}
          >
            {connected ? "✦ Generate" : "ComfyUI offline"}
          </Button>
        </Card>
      </div>

      {/* right: output */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Card className="flex flex-1 flex-col overflow-hidden">
          {job ? (
            <div className="flex h-full flex-col gap-3">
              <div className="flex items-center justify-between text-xs text-ink-300">
                <span className="truncate pr-4">{job.prompt || "(no prompt)"}</span>
                <span className="shrink-0 text-ink-400">
                  seed {job.seed ?? "—"} · {job.status}
                </span>
              </div>
              {running && (
                <ProgressBar
                  value={job.progress?.value ?? 0}
                  max={job.progress?.max ?? 1}
                  indeterminate={!job.progress}
                />
              )}
              {running && job.currentNode && (
                <div className="text-[11px] text-ink-400">
                  node: {job.currentNode}
                </div>
              )}
              <div className="flex min-h-0 flex-1 items-center justify-center">
                {job.images.length > 0 ? (
                  <div className="flex h-full w-full flex-wrap items-center justify-center gap-3 overflow-y-auto">
                    {job.images.map((img) => (
                      <img
                        key={img.filename}
                        src={imageRefSrc(img, config)}
                        className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
                      />
                    ))}
                  </div>
                ) : running && previewUrl ? (
                  <img
                    src={previewUrl}
                    className="max-h-full max-w-full rounded-xl object-contain opacity-90"
                  />
                ) : running ? (
                  <div className="h-64 w-64 animate-shimmer rounded-2xl" />
                ) : job.status === "error" ? (
                  <div className="max-w-md text-center text-sm text-red-300">
                    {job.error}
                  </div>
                ) : (
                  <EmptyState title="Waiting…" />
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              icon="✦"
              title="Ready when you are"
              hint="Write a prompt and hit Generate. Progress and results appear here."
            />
          )}
        </Card>

        {recent.length > 0 && (
          <Card className="shrink-0">
            <Label>Recent</Label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recent.map((j) => (
                <img
                  key={j.promptId}
                  src={imageRefSrc(j.images[0], config)}
                  title={j.prompt}
                  onClick={() => setLastPromptId(j.promptId)}
                  className="h-20 w-20 shrink-0 cursor-pointer rounded-lg object-cover transition-transform hover:scale-105"
                />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
