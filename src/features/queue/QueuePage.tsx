import { useEffect, useState } from "react";
import { useApp } from "../../stores/app";
import { useGeneration } from "../../stores/generation";
import {
  cancelQueueItems,
  clearQueue,
  getQueue,
  interrupt,
  type QueueEntry,
} from "../../api/comfy";
import { Button, Card, EmptyState, ProgressBar } from "../../components/ui";
import type { WorkflowJson } from "../../types";

/** Best-effort prompt snippet from a raw queued workflow. */
function snippet(wf: WorkflowJson): string {
  let best = "";
  for (const node of Object.values(wf)) {
    const title = (node._meta?.title ?? "").toLowerCase();
    for (const key of ["text", "value"]) {
      const v = node.inputs?.[key];
      if (typeof v === "string" && v.trim() && !title.includes("system")) {
        if (title.includes("user prompt")) return v;
        if (v.length > best.length) best = v;
      }
    }
  }
  return best || "(workflow)";
}

export default function QueuePage() {
  const connected = useApp((s) => s.connected);
  const jobs = useGeneration((s) => s.jobs);
  const queueRemaining = useGeneration((s) => s.queueRemaining);
  const [running, setRunning] = useState<QueueEntry[]>([]);
  const [pending, setPending] = useState<QueueEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const q = await getQueue();
        if (!alive) return;
        setRunning(q.queue_running);
        setPending(q.queue_pending);
        setErr(null);
      } catch (e) {
        if (alive) setErr(String(e));
      }
    };
    void load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [connected, queueRemaining]);

  const total = running.length + pending.length;

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Queue</h1>
        <span className="text-xs text-ink-400">
          {total === 0 ? "idle" : `${total} job${total > 1 ? "s" : ""}`}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="ghost"
            disabled={running.length === 0}
            onClick={() => void interrupt()}
          >
            ■ Interrupt current
          </Button>
          <Button
            variant="danger"
            disabled={pending.length === 0}
            onClick={() => void clearQueue()}
          >
            Clear pending
          </Button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          Can't reach ComfyUI: {err}
        </div>
      )}

      {total === 0 && !err ? (
        <EmptyState
          icon="≡"
          title="Queue is empty"
          hint="Jobs you generate (including batches) show up here while waiting or rendering."
        />
      ) : (
        <div className="space-y-2 overflow-y-auto">
          {running.map(([, promptId, wf]) => {
            const job = jobs[promptId];
            return (
              <Card key={promptId} className="space-y-2 border-accent-500/30">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-glow" />
                  <span className="flex-1 truncate text-sm">
                    {job?.prompt || snippet(wf)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-accent-300">
                    rendering
                  </span>
                </div>
                <ProgressBar
                  value={job?.progress?.value ?? 0}
                  max={job?.progress?.max ?? 1}
                  indeterminate={!job?.progress}
                />
              </Card>
            );
          })}
          {pending.map(([, promptId, wf], i) => {
            const job = jobs[promptId];
            return (
              <Card key={promptId} className="flex items-center gap-3 py-3">
                <span className="w-8 text-center text-xs text-ink-400">
                  #{i + 1}
                </span>
                <span className="flex-1 truncate text-sm text-ink-200">
                  {job?.prompt || snippet(wf)}
                </span>
                {job?.batchId && (
                  <span className="rounded bg-accent-600/20 px-1.5 py-0.5 text-[10px] text-accent-300">
                    batch
                  </span>
                )}
                <Button
                  variant="subtle"
                  className="!px-2 !py-1 text-xs"
                  onClick={() => void cancelQueueItems([promptId])}
                >
                  ✕ Cancel
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
