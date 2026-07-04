import { useApp, type Tab } from "../stores/app";
import { useGeneration } from "../stores/generation";
import { useBatch } from "../stores/batch";
import ComfyBootPanel from "./ComfyBootPanel";
import logo from "../assets/logo.png";

const items: { tab: Tab; label: string; icon: string }[] = [
  { tab: "generate", label: "Generate", icon: "✦" },
  { tab: "gallery", label: "Gallery", icon: "▦" },
  { tab: "queue", label: "Queue", icon: "≡" },
  { tab: "presets", label: "Presets", icon: "❖" },
  { tab: "batch", label: "Batch", icon: "⧉" },
  { tab: "models", label: "Models", icon: "◍" },
  { tab: "settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar() {
  const { tab, setTab, connected, comfyVersion } = useApp();
  const queueRemaining = useGeneration((s) => s.queueRemaining);
  const batchRunning = useBatch((s) => s.running);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-ink-800 bg-ink-900/60">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <img
          src={logo}
          alt="Todly"
          className="h-9 w-9 rounded-xl shadow-lg shadow-accent-600/30"
        />
        <div>
          <div className="text-base font-semibold tracking-tight">Todly</div>
          <div className="text-[10px] text-ink-400">for ComfyUI</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 pt-2">
        {items.map((it) => (
          <button
            key={it.tab}
            onClick={() => setTab(it.tab)}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all cursor-pointer ${
              tab === it.tab
                ? "bg-accent-500/15 text-accent-300 shadow-inner"
                : "text-ink-300 hover:bg-ink-800 hover:text-ink-100"
            }`}
          >
            <span className="w-5 text-center text-base leading-none">{it.icon}</span>
            {it.label}
            {it.tab === "queue" && queueRemaining > 0 && (
              <span className="ml-auto rounded-full bg-accent-500/25 px-2 py-0.5 text-[10px] font-bold text-accent-300">
                {queueRemaining}
              </span>
            )}
            {it.tab === "batch" && batchRunning && (
              <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-glow" />
            )}
          </button>
        ))}
      </nav>

      <div className="border-t border-ink-800 px-5 py-4">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
          />
          <span className="text-ink-300">
            {connected ? "ComfyUI connected" : "ComfyUI offline"}
          </span>
        </div>
        {comfyVersion && (
          <div className="mt-1 pl-4 text-[10px] text-ink-400">v{comfyVersion}</div>
        )}
        <ComfyBootPanel />
      </div>
    </aside>
  );
}
