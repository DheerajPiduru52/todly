import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getComfyAddress } from "./comfy";

export interface ComfyWsEvent {
  type: string;
  data: Record<string, unknown> & {
    prompt_id?: string;
    node?: string | null;
    value?: number;
    max?: number;
  };
}

type EventHandler = (ev: ComfyWsEvent) => void;
type PreviewHandler = (dataUrl: string) => void;
type StatusHandler = (connected: boolean) => void;

/**
 * ComfyUI event stream. The actual websocket lives on the Rust side (browser
 * requests are 403'd by ComfyUI's origin checks); events arrive as Tauri events.
 */
class ComfyWs {
  clientId = crypto.randomUUID();
  private eventHandlers = new Set<EventHandler>();
  private previewHandlers = new Set<PreviewHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private listening = false;

  private async ensureListeners() {
    if (this.listening) return;
    this.listening = true;
    await listen<string>("comfy-ws-message", (e) => {
      try {
        const ev = JSON.parse(e.payload) as ComfyWsEvent;
        this.eventHandlers.forEach((h) => h(ev));
      } catch {
        /* ignore malformed frames */
      }
    });
    await listen<string>("comfy-ws-preview", (e) => {
      this.previewHandlers.forEach((h) => h(e.payload));
    });
    await listen<boolean>("comfy-ws-status", (e) => {
      this.statusHandlers.forEach((h) => h(e.payload));
    });
  }

  /** (Re)start the Rust-side websocket loop against the configured address. */
  async connect() {
    await this.ensureListeners();
    const { host, port } = getComfyAddress();
    await invoke("ws_start", { host, port, clientId: this.clientId });
  }

  onEvent(h: EventHandler) {
    this.eventHandlers.add(h);
    return () => this.eventHandlers.delete(h);
  }
  onPreview(h: PreviewHandler) {
    this.previewHandlers.add(h);
    return () => this.previewHandlers.delete(h);
  }
  onStatus(h: StatusHandler) {
    this.statusHandlers.add(h);
    return () => this.statusHandlers.delete(h);
  }
}

export const comfyWs = new ComfyWs();
