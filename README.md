# Todly

A modern desktop front-end for a local [ComfyUI](https://github.com/comfyanonymous/ComfyUI) server. Prompt in, image out — no node graph, no raw JSON.

Built with **Tauri 2 + React 19 + Tailwind v4** (dark glass UI, ~10 MB install).

## Why

ComfyUI is the most flexible way to run Stable Diffusion / Flux / Krea-style models locally, but its default UI is a node graph — brilliant for building pipelines, overkill every time you just want to type a prompt and get an image. Switching models, tweaking a LoRA, or running a batch of prompts means clicking through the same graph each time.

Todly sits in front of an existing ComfyUI install and exposes only what casual, fast use actually needs: a prompt box, a resolution picker, a model/LoRA dropdown, and a batch runner — while the full node graph stays exactly where it is for when you need it. It doesn't replace ComfyUI or reimplement any of its inference code; it's a thin, model-agnostic client that talks to ComfyUI's existing REST/WebSocket API. Every "simple" field on screen maps to a specific node input in a workflow you already built and exported — install a new checkpoint or LoRA, and it's just another preset, not new code.

It started as a personal tool to speed up day-to-day generation and batch work, and is shared here as-is in case it's useful to anyone else running ComfyUI locally.

## What it does

- **Generate** — prompt box, aspect-ratio picker, model/LoRA dropdowns, live progress, with steps/CFG/sampler tucked into an optional Advanced section.
- **Gallery** — reads straight from your ComfyUI output folder; click any image to see its embedded prompt/seed/model and one-click regenerate.
- **Queue** — see what's running/pending, cancel individual jobs.
- **Presets** — import any ComfyUI workflow (exported in **API format**) and map a few fields (prompt, seed, resolution, model, LoRA) to specific node inputs. That mapping is the entire abstraction — new checkpoint or pipeline = new preset, no code changes.
- **Batch** — import a `.txt` file with prompts wrapped in `[square brackets]`, edit/reorder them, run the whole list against one preset with random/fixed/incrementing seeds, pause/cancel mid-run, export a CSV/JSON manifest afterward.
- **Models** — browse installed checkpoints/LoRAs/VAEs with disk usage. (A downloader for Civitai/Hugging Face is planned but not built yet.)
- **Start ComfyUI** — optionally launch ComfyUI's embedded Python directly from Settings, with boot progress shown in the sidebar. It only starts a new process if nothing is already listening on the configured port — it never force-kills an existing server.

## Prerequisites

- Windows (the launcher, asset-protocol paths, and icon are Windows-specific right now)
- [Rust](https://rustup.rs/) + Cargo
- [Node.js](https://nodejs.org/) 20+ and [pnpm](https://pnpm.io/)
- An existing local [ComfyUI](https://github.com/comfyanonymous/ComfyUI) install (portable or otherwise) with at least one checkpoint/UNET model

## Getting started

You don't need to know Rust or React to use Todly day-to-day — the steps below get you from a fresh clone to your first generated image, no prior experience with this codebase assumed.

**1. Get it running.**

```powershell
git clone <this-repo>
cd todly
pnpm install
.\dev.ps1        # hot-reload dev build; opens the app window
```

`dev.ps1` / `build.ps1` pin `CARGO_HOME` and pnpm's store/cache to folders inside the project itself, so a clone stays self-contained regardless of where you put it. (Once you're happy with it, `.\build.ps1` produces a standalone `src-tauri\target\release\todly.exe` you can launch directly, without the dev tooling.)

**2. Point it at your ComfyUI install.** Todly has no way to guess where you installed ComfyUI, so on first launch it opens straight to **Settings** and asks:
   - Click **Browse…** next to "ComfyUI folder" and select the folder that directly contains `main.py` — e.g. `...\ComfyUI_windows_portable\ComfyUI`.
   - The **Output folder** and **Models folder** fields auto-fill from that pick; you normally don't need to edit them.
   - Click **Save**, then **Test connection** — if ComfyUI is already running you'll see "Connected ✓" and its version.

**3. Start ComfyUI, if it isn't running yet.** Click **Start ComfyUI now** in Settings, or the **▶ Start ComfyUI** button in the sidebar on any screen. A short boot log streams in the sidebar while it loads (this only starts a new process if nothing's already listening on the port — it never kills an existing server). Once ready, the sidebar shows a green **"ComfyUI connected"** dot. Turn on **Auto-start ComfyUI when Todly opens** in Settings if you'd rather not repeat this step.

**4. Generate something.** Go to **Generate**, type a prompt, optionally pick an aspect ratio, and click **✦ Generate**. A starter preset (Comfy-Org's public Krea-2 Turbo workflow — no prompt/personal data baked in) is seeded in automatically on first run, so there's already something to generate with; import your own workflow from **Presets** whenever you're ready to go further.

**5. Find your images.** Click **Gallery** any time to browse everything you've generated, see the exact prompt/seed/model behind any image, and regenerate it.

Todly's own data (config, presets, batch manifests) lives in a `data\` folder created next to the executable — nothing is written outside the project/install folder.

| | |
|---|---|
| Development (hot reload) | `.\dev.ps1` |
| Release build | `.\build.ps1` → `src-tauri\target\release\todly.exe` |

## Layout

```
src\                  React frontend
  api\                comfy.ts (REST via Rust), ws.ts (event bridge), tauri.ts (commands)
  stores\             zustand: app (config/presets), generation (jobs/WS), batch (runner), launch (start ComfyUI)
  lib\                preset.ts (field mapping), parseBatch.ts, metadata.ts (PNG), img.ts
  features\           generate/ gallery/ queue/ presets/ batch/ models/ settings/
src-tauri\
  src\commands.rs     config, presets, gallery listing, PNG tEXt parsing, manifests
  src\ws.rs           ComfyUI websocket loop, comfy_fetch, asset-scope command
  src\launch.rs       launches ComfyUI's embedded Python directly, streams boot log
data\                 config.json · presets\*.json · batches\*.json  (created at runtime, next to the exe)
```

## How it talks to ComfyUI

ComfyUI ≥ 0.26 returns **403 to any browser-context cross-origin request** (`Sec-Fetch-Site` / `Origin` checks in `create_origin_only_middleware`). Todly therefore never calls the server from the webview:

- **REST** — `comfy_fetch` Tauri command (Rust `reqwest`, sends no Origin header).
- **WebSocket** — `tokio-tungstenite` loop in Rust, bridged to the UI as Tauri events (`comfy-ws-message` / `comfy-ws-preview` / `comfy-ws-status`), auto-reconnects every 2.5 s.
- **Images** — read straight from the output folder on disk via the asset protocol (scope granted at runtime), so the gallery also works while ComfyUI is offline.

Don't "simplify" any of this back to `fetch()`/`new WebSocket()` in the frontend — it will 403.

## Presets = the model-agnostic core

A preset is an **API-format workflow JSON** (ComfyUI → Workflow → *Export (API)*) plus mappings from exposed fields to node inputs:

```jsonc
{
  "id": "krea2-turbo",
  "workflow": { /* API-format graph */ },
  "fields": { "prompt": { "node": "30:19", "input": "value" }, "seed": { "node": "30:3", "input": "seed" } },
  "toggles": [ { "key": "enable_lora", "label": "Enable style LoRA", "ref": { "node": "30:23", "input": "value" } } ],
  "loras":   [ { "label": "Style LoRA", "nameRef": { "node": "30:15", "input": "lora_name" } } ]
}
```

The Generate screen renders only the mapped fields; combo options (models, LoRAs, samplers, aspect ratios) are resolved live from `/object_info`, so newly installed models appear after a refresh. Import + field mapping happens in the **Presets** tab (auto-guesses common nodes for you).

Gallery images that ComfyUI generated carry their full API workflow in a PNG `tEXt` chunk — that's what powers the metadata viewer and "Regenerate" button.

## Batch tab

Import a `.txt` where each prompt is wrapped in `[square brackets]` (regex-parsed; empty pairs, unmatched brackets, and stray text are reported, not silently dropped). Edit/reorder/delete before running; one preset applies to the whole batch; seeds random/fixed/incrementing; pause (after current) and cancel mid-run. Every run writes a manifest to `data\batches\` mapping prompt → seed → output files, exportable as CSV/JSON; the gallery tags images with their batch.

## Configuration

All settings live in `data\config.json` next to the executable (gitignored, never committed — see `.gitignore`). If you're adding integrations that need credentials later (e.g. a model-downloader API key), that's where they belong: persisted to this file at runtime, never hardcoded in source or baked into a committed preset.

## Not built yet (deliberately)

The **Models tab downloader** (direct URL + Civitai/Hugging Face search, auto-sort into model folders, checksum + disk-space checks) is stubbed pending further work.

## Screenshots

None included yet. If you add some, use real screen captures of the app — never a ComfyUI output PNG, since ComfyUI embeds the full prompt and workflow in the file's metadata.

## Status

Early / personal-project-turned-public. The core generate → gallery → queue → preset → batch flow is working and has been used for real batch runs; the Models tab downloader is still a stub (see above). Expect rough edges, and treat it as a starting point rather than a polished release.

## Contributing

Issues and PRs are welcome. A few things worth knowing before diving in:

- Keep the ComfyUI communication path in Rust (see "How it talks to ComfyUI" above) — moving REST/WebSocket calls back into the webview will break against any ComfyUI ≥ 0.26 install.
- New model support should go through the preset system (field mappings), not hardcoded logic — that's the whole point of the architecture.
- If you touch `src-tauri/src/commands.rs`'s `data_dir()` or config handling, remember `data/config.json` must stay out of git (it's where local paths and any future API keys live).

## Disclaimer

Todly is an independent, unofficial front-end. It is not affiliated with, endorsed by, or built by the ComfyUI or Comfy-Org projects — it just talks to a ComfyUI server you run yourself, over the same API ComfyUI's own web UI uses.

## License

MIT — see [LICENSE](LICENSE).
