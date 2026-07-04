import { useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useApp } from "../../stores/app";
import * as tauri from "../../api/tauri";
import {
  describeNodes,
  guessExtras,
  guessFields,
  literalInputs,
} from "../../lib/preset";
import {
  Button,
  Card,
  EmptyState,
  Label,
  Modal,
  Select,
  TextInput,
} from "../../components/ui";
import type {
  CoreFieldKey,
  FieldRef,
  Preset,
  WorkflowJson,
} from "../../types";

const FIELD_LABELS: Record<CoreFieldKey, string> = {
  prompt: "Prompt",
  negative: "Negative prompt",
  seed: "Seed",
  steps: "Steps",
  cfg: "CFG",
  sampler: "Sampler",
  scheduler: "Scheduler",
  width: "Width",
  height: "Height",
  aspectRatio: "Aspect ratio",
  megapixels: "Megapixels",
  model: "Model / checkpoint",
  batchSize: "Batch size",
};

export default function PresetsPage() {
  const { presets, reloadPresets, config, saveConfig, activePresetId, setActivePreset } =
    useApp();
  const [editing, setEditing] = useState<Preset | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function importWorkflow() {
    setImportError(null);
    const file = await openDialog({
      title: "Import ComfyUI workflow (API format)",
      filters: [{ name: "Workflow JSON", extensions: ["json"] }],
      multiple: false,
    });
    if (!file) return;
    try {
      const raw = await tauri.readTextFile(file as string);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(parsed.nodes)) {
        setImportError(
          "That file is a UI-format workflow (node graph). In ComfyUI use Workflow → Export (API) and import that file instead — it contains the executable graph Todly needs.",
        );
        return;
      }
      const wf = parsed as WorkflowJson;
      const bad = Object.entries(wf).find(
        ([, n]) => typeof n !== "object" || !n?.class_type,
      );
      if (bad) {
        setImportError("This doesn't look like an API-format workflow JSON.");
        return;
      }
      const { loras, toggles } = guessExtras(wf);
      setEditing({
        id: "",
        name: "",
        workflow: wf,
        fields: guessFields(wf),
        loras,
        toggles,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      setImportError(`Import failed: ${e}`);
    }
  }

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Presets</h1>
        <span className="text-xs text-ink-400">
          workflow + exposed fields — the model-agnostic core of Todly
        </span>
        <Button className="ml-auto" onClick={importWorkflow}>
          + Import workflow (API JSON)
        </Button>
      </div>

      {importError && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          {importError}
        </div>
      )}

      {presets.length === 0 ? (
        <EmptyState
          icon="❖"
          title="No presets"
          hint="Import a workflow JSON exported from ComfyUI (Export → API) to create your first preset."
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 overflow-y-auto pb-4">
          {presets.map((p) => {
            const isDefault = config?.defaultPresetId === p.id;
            const mapped = Object.keys(p.fields).length;
            return (
              <Card key={p.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    {p.description && (
                      <div className="mt-0.5 text-xs text-ink-400">{p.description}</div>
                    )}
                  </div>
                  {isDefault && (
                    <span className="rounded-md bg-accent-500/20 px-2 py-0.5 text-[10px] font-semibold text-accent-300">
                      default
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(p.fields) as CoreFieldKey[]).map((k) => (
                    <span
                      key={k}
                      className="rounded-md bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-300"
                    >
                      {FIELD_LABELS[k]}
                    </span>
                  ))}
                  {(p.loras ?? []).length > 0 && (
                    <span className="rounded-md bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-300">
                      LoRA ×{p.loras!.length}
                    </span>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => {
                      setActivePreset(p.id);
                      useApp.getState().setTab("generate");
                    }}
                  >
                    Use
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => setEditing(JSON.parse(JSON.stringify(p)))}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={async () => {
                      const copy: Preset = JSON.parse(JSON.stringify(p));
                      copy.id = uniqueId(`${p.id}-copy`, presets);
                      copy.name = `${p.name} (copy)`;
                      await tauri.savePreset(copy);
                      await reloadPresets();
                    }}
                  >
                    Duplicate
                  </Button>
                  {!isDefault && config && (
                    <Button
                      variant="subtle"
                      className="!px-3 !py-1.5 text-xs"
                      onClick={() =>
                        saveConfig({ ...config, defaultPresetId: p.id })
                      }
                    >
                      Set default
                    </Button>
                  )}
                  {confirmDeleteId === p.id ? (
                    <Button
                      variant="danger"
                      className="!px-3 !py-1.5 text-xs"
                      onClick={async () => {
                        await tauri.deletePreset(p.id);
                        setConfirmDeleteId(null);
                        await reloadPresets();
                      }}
                    >
                      Confirm?
                    </Button>
                  ) : (
                    <Button
                      variant="subtle"
                      className="!px-3 !py-1.5 text-xs text-red-400"
                      onClick={() => setConfirmDeleteId(p.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <PresetEditor
          preset={editing}
          existing={presets}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reloadPresets();
          }}
        />
      )}
    </div>
  );
}

function uniqueId(base: string, presets: Preset[]): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "preset";
  let id = slug;
  let n = 2;
  while (presets.some((p) => p.id === id)) id = `${slug}-${n++}`;
  return id;
}

function PresetEditor({
  preset,
  existing,
  onClose,
  onSaved,
}: {
  preset: Preset;
  existing: Preset[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(preset.name);
  const [description, setDescription] = useState(preset.description ?? "");
  const [fields, setFields] = useState(preset.fields);
  const [toggles, setToggles] = useState(preset.toggles ?? []);
  const [loras, setLoras] = useState(preset.loras ?? []);
  const [error, setError] = useState<string | null>(null);

  const nodes = useMemo(() => describeNodes(preset.workflow), [preset.workflow]);

  function setField(key: CoreFieldKey, ref: FieldRef | undefined) {
    setFields((prev) => {
      const next = { ...prev };
      if (ref) next[key] = ref;
      else delete next[key];
      return next;
    });
  }

  async function save() {
    if (!name.trim()) {
      setError("Give the preset a name.");
      return;
    }
    if (!fields.prompt) {
      setError("Map at least the Prompt field so the Generate screen has something to send.");
      return;
    }
    const p: Preset = {
      ...preset,
      id: preset.id || uniqueId(name, existing),
      name: name.trim(),
      description: description.trim() || undefined,
      fields,
      toggles: toggles.length ? toggles : undefined,
      loras: loras.length ? loras : undefined,
    };
    try {
      await tauri.savePreset(p);
      onSaved();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <Modal open onClose={onClose} wide>
      <div className="space-y-4">
        <h2 className="text-base font-semibold">
          {preset.id ? "Edit preset" : "New preset from workflow"}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <TextInput
              value={name}
              placeholder="e.g. Krea2 Turbo — Card Art"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label>Description</Label>
            <TextInput
              value={description}
              placeholder="optional"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>Exposed fields → workflow inputs</Label>
          <div className="space-y-1.5">
            {(Object.keys(FIELD_LABELS) as CoreFieldKey[]).map((key) => (
              <FieldRow
                key={key}
                label={FIELD_LABELS[key]}
                nodes={nodes}
                workflow={preset.workflow}
                value={fields[key]}
                onChange={(ref) => setField(key, ref)}
              />
            ))}
          </div>
        </div>

        {loras.length > 0 && (
          <div>
            <Label>LoRA slots (auto-detected)</Label>
            <div className="space-y-1 text-xs text-ink-300">
              {loras.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1">
                    {l.label} → node {l.nameRef.node}
                  </span>
                  <Button
                    variant="subtle"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => setLoras(loras.filter((_, j) => j !== i))}
                  >
                    remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {toggles.length > 0 && (
          <div>
            <Label>Toggles (booleans exposed on the Generate screen)</Label>
            <div className="space-y-1.5">
              {toggles.map((t, i) => (
                <div key={t.key} className="flex items-center gap-2 text-xs">
                  <TextInput
                    className="!w-64 !py-1"
                    value={t.label}
                    onChange={(e) =>
                      setToggles(
                        toggles.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <span className="text-ink-400">
                    node {t.ref.node}.{t.ref.input}
                  </span>
                  <Button
                    variant="subtle"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => setToggles(toggles.filter((_, j) => j !== i))}
                  >
                    remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save preset</Button>
        </div>
      </div>
    </Modal>
  );
}

function FieldRow({
  label,
  nodes,
  workflow,
  value,
  onChange,
}: {
  label: string;
  nodes: { id: string; label: string }[];
  workflow: WorkflowJson;
  value: FieldRef | undefined;
  onChange: (ref: FieldRef | undefined) => void;
}) {
  const inputs = value ? literalInputs(workflow[value.node] ?? { class_type: "", inputs: {} }) : [];
  return (
    <div className="grid grid-cols-[150px_1fr_180px] items-center gap-2">
      <span className="text-xs text-ink-300">{label}</span>
      <Select
        className="!py-1.5 text-xs"
        value={value?.node ?? ""}
        onChange={(e) => {
          const node = e.target.value;
          if (!node) return onChange(undefined);
          const first = literalInputs(workflow[node])[0] ?? "";
          onChange({ node, input: first });
        }}
        options={[
          { value: "", label: "— not exposed —" },
          ...nodes.map((n) => ({ value: n.id, label: n.label })),
        ]}
      />
      {value ? (
        <Select
          className="!py-1.5 text-xs"
          value={value.input}
          onChange={(e) => onChange({ ...value, input: e.target.value })}
          options={inputs.map((i) => ({ value: i }))}
        />
      ) : (
        <span />
      )}
    </div>
  );
}
