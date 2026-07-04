import { useEffect, useState } from "react";
import { useApp } from "../stores/app";
import { useLaunch } from "../stores/launch";
import { Button } from "./ui";

function useElapsed(startedAt: number | null, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!startedAt) return 0;
  return Math.max(0, Math.round((now - startedAt) / 1000));
}

/** Sidebar widget: start ComfyUI's embedded Python directly and show boot progress. */
export default function ComfyBootPanel() {
  const config = useApp((s) => s.config);
  const connected = useApp((s) => s.connected);
  const { status, log, error, startedAt, start, reset } = useLaunch();
  const [showLog, setShowLog] = useState(false);
  const elapsed = useElapsed(startedAt, status === "launching" || status === "booting");

  // auto-dismiss the transient "ready" confirmation
  useEffect(() => {
    if (status !== "ready") return;
    const t = setTimeout(reset, 2500);
    return () => clearTimeout(t);
  }, [status, reset]);

  if (connected && status === "idle") return null;

  if (status === "idle" || status === "error") {
    return (
      <div className="mt-2 space-y-1.5">
        {status === "error" && error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] leading-snug text-red-300">
            {error}
          </div>
        )}
        <Button
          variant={status === "error" ? "ghost" : "primary"}
          className="w-full !py-1.5 text-xs"
          disabled={!config}
          onClick={() =>
            config && start(config.comfyRoot, config.comfyHost, config.comfyPort)
          }
        >
          {status === "error" ? "↻ Retry" : "▶ Start ComfyUI"}
        </Button>
        {status === "error" && log.length > 0 && (
          <LogToggle log={log} show={showLog} setShow={setShowLog} />
        )}
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="mt-2 text-[11px] text-emerald-400">
        {connected ? "Connected ✓" : "Already running ✓"}
      </div>
    );
  }

  // launching / booting
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2 text-[11px] text-ink-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-glow" />
        Starting ComfyUI… {elapsed}s
      </div>
      <LogToggle log={log} show={showLog} setShow={setShowLog} />
    </div>
  );
}

function LogToggle({
  log,
  show,
  setShow,
}: {
  log: string[];
  show: boolean;
  setShow: (v: boolean) => void;
}) {
  return (
    <div>
      <button
        onClick={() => setShow(!show)}
        className="text-[10px] text-ink-400 hover:text-ink-200 cursor-pointer"
      >
        {show ? "▾ hide boot log" : "▸ view boot log"}
      </button>
      {show && (
        <div className="mt-1 max-h-32 overflow-y-auto rounded-lg bg-ink-950 p-2 font-mono text-[10px] leading-relaxed text-ink-400">
          {log.slice(-40).map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
