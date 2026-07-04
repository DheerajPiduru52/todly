import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useApp } from "../../stores/app";
import { useLaunch } from "../../stores/launch";
import { getSystemStats } from "../../api/comfy";
import { getDataDir } from "../../api/tauri";
import { Button, Card, Label, NumberInput, TextInput, Toggle } from "../../components/ui";

export default function SettingsPage() {
  const { config, saveConfig } = useApp();
  const launch = useLaunch();
  const [form, setForm] = useState(config);
  const [status, setStatus] = useState<string | null>(null);
  const [dataDir, setDataDir] = useState<string | null>(null);

  useEffect(() => setForm(config), [config]);
  useEffect(() => {
    getDataDir().then(setDataDir).catch(() => {});
  }, []);

  if (!form) return null;

  const hasComfyRoot = form.comfyRoot.trim().length > 0;
  const portableRoot = form.comfyRoot.replace(/\\[^\\]+\\?$/, "");
  const pythonExe = hasComfyRoot ? `${portableRoot}\\python_embeded\\python.exe` : null;
  const mainPy = hasComfyRoot ? `${form.comfyRoot}\\main.py` : null;

  async function browseComfyRoot() {
    const dir = await openDialog({
      directory: true,
      title: "Select your ComfyUI folder (contains main.py)",
    });
    if (!dir || Array.isArray(dir)) return;
    setForm((f) =>
      f
        ? { ...f, comfyRoot: dir, outputDir: `${dir}\\output`, modelsDir: `${dir}\\models` }
        : f,
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-5">
      <h1 className="text-lg font-semibold">Settings</h1>

      {!hasComfyRoot && (
        <div className="rounded-xl border border-accent-500/30 bg-accent-500/10 px-4 py-3 text-sm text-accent-200">
          Point Todly at your ComfyUI folder to get started — click Browse below.
        </div>
      )}

      <Card className="space-y-4">
        <div>
          <Label>ComfyUI folder</Label>
          <div className="flex gap-2">
            <TextInput
              value={form.comfyRoot}
              placeholder="e.g. C:\ComfyUI_windows_portable\ComfyUI"
              onChange={(e) => setForm({ ...form, comfyRoot: e.target.value })}
            />
            <Button variant="ghost" onClick={browseComfyRoot}>
              Browse…
            </Button>
          </div>
          <div className="mt-1 text-[11px] text-ink-400">
            The ComfyUI folder itself — contains main.py, models\, and output\. Picking it
            here also fills in the output/models folders below.
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label>ComfyUI host</Label>
            <TextInput
              value={form.comfyHost}
              onChange={(e) => setForm({ ...form, comfyHost: e.target.value })}
            />
          </div>
          <div className="w-32">
            <Label>Port</Label>
            <NumberInput
              value={form.comfyPort}
              min={1}
              max={65535}
              onValue={(n) => setForm({ ...form, comfyPort: n })}
            />
          </div>
        </div>
        <div>
          <Label>Output folder (generated images)</Label>
          <TextInput
            value={form.outputDir}
            onChange={(e) => setForm({ ...form, outputDir: e.target.value })}
          />
        </div>
        <div>
          <Label>Models folder</Label>
          <TextInput
            value={form.modelsDir}
            onChange={(e) => setForm({ ...form, modelsDir: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              await saveConfig(form);
              setStatus("Saved ✓");
            }}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              setStatus("Testing…");
              try {
                await saveConfig(form);
                const s = await getSystemStats();
                setStatus(`Connected ✓ — ComfyUI v${s.system.comfyui_version}`);
              } catch (e) {
                setStatus(`Connection failed: ${e}`);
              }
            }}
          >
            Test connection
          </Button>
          <Button
            variant="subtle"
            disabled={!dataDir}
            onClick={() => dataDir && revealItemInDir(`${dataDir}\\config.json`)}
          >
            Open data folder
          </Button>
        </div>
        {status && <div className="text-xs text-ink-300">{status}</div>}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-ink-200">Launching ComfyUI</div>
            <div className="mt-0.5 text-xs text-ink-400">
              Runs <span className="text-ink-300">python_embeded\python.exe</span> directly
              — never kills an existing server on the port, unlike run.bat.
            </div>
          </div>
        </div>
        <Toggle
          checked={form.autoLaunchComfy}
          onChange={async (v) => {
            const next = { ...form, autoLaunchComfy: v };
            setForm(next);
            await saveConfig(next);
          }}
          label="Auto-start ComfyUI when Todly opens"
        />
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="text-xs"
            disabled={!hasComfyRoot || launch.status === "launching" || launch.status === "booting"}
            onClick={() => launch.start(form.comfyRoot, form.comfyHost, form.comfyPort)}
          >
            {launch.status === "launching" || launch.status === "booting"
              ? "Starting…"
              : "Start ComfyUI now"}
          </Button>
          {launch.status === "ready" && (
            <span className="text-xs text-emerald-400">✓ running</span>
          )}
          {launch.status === "error" && (
            <span className="text-xs text-red-400">{launch.error}</span>
          )}
        </div>
        {hasComfyRoot ? (
          <div className="space-y-1 rounded-lg bg-ink-900/70 p-3 font-mono text-[11px] text-ink-400">
            <div>python: {pythonExe}</div>
            <div>script: {mainPy}</div>
          </div>
        ) : (
          <div className="rounded-lg bg-ink-900/70 p-3 text-[11px] text-ink-400">
            Set your ComfyUI folder above first.
          </div>
        )}
      </Card>

      <Card className="text-xs leading-relaxed text-ink-400">
        <div className="mb-1 font-semibold text-ink-300">About</div>
        Todly keeps its config, presets and batch manifests in{" "}
        <span className="text-ink-200">{dataDir ?? "a data folder next to the app"}</span>.
        Images are read from and written to your ComfyUI output folder — nothing is
        duplicated.
      </Card>
    </div>
  );
}
