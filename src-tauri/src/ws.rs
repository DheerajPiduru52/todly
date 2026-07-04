use base64::Engine;
use futures_util::StreamExt;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tokio_tungstenite::tungstenite::Message;

/// Handle of the currently running websocket loop, so reconnects with a new
/// address replace the old task instead of stacking up.
pub struct WsState(pub Mutex<Option<tauri::async_runtime::JoinHandle<()>>>);

#[tauri::command]
pub fn ws_start(
    app: AppHandle,
    state: tauri::State<'_, WsState>,
    host: String,
    port: u16,
    client_id: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(h) = guard.take() {
        h.abort();
    }
    *guard = Some(tauri::async_runtime::spawn(ws_loop(
        app, host, port, client_id,
    )));
    Ok(())
}

async fn ws_loop(app: AppHandle, host: String, port: u16, client_id: String) {
    let url = format!("ws://{host}:{port}/ws?clientId={client_id}");
    loop {
        match tokio_tungstenite::connect_async(&url).await {
            Ok((stream, _)) => {
                let _ = app.emit("comfy-ws-status", true);
                let (_write, mut read) = stream.split();
                while let Some(msg) = read.next().await {
                    match msg {
                        Ok(Message::Text(t)) => {
                            let _ = app.emit("comfy-ws-message", t.to_string());
                        }
                        Ok(Message::Binary(b)) => {
                            // 4-byte event type + 4-byte format + image data
                            if b.len() > 8 {
                                let event = u32::from_be_bytes([b[0], b[1], b[2], b[3]]);
                                if event == 1 {
                                    // PREVIEW_IMAGE
                                    let format = u32::from_be_bytes([b[4], b[5], b[6], b[7]]);
                                    let mime =
                                        if format == 2 { "image/png" } else { "image/jpeg" };
                                    let b64 = base64::engine::general_purpose::STANDARD
                                        .encode(&b[8..]);
                                    let _ = app.emit(
                                        "comfy-ws-preview",
                                        format!("data:{mime};base64,{b64}"),
                                    );
                                }
                            }
                        }
                        Ok(Message::Close(_)) | Err(_) => break,
                        _ => {}
                    }
                }
                let _ = app.emit("comfy-ws-status", false);
            }
            Err(_) => {
                let _ = app.emit("comfy-ws-status", false);
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
    }
}

#[derive(serde::Serialize)]
pub struct ComfyResponse {
    pub status: u16,
    pub body: String,
}

/// HTTP to ComfyUI from Rust: no Origin/Sec-Fetch headers, so the server's
/// cross-origin 403 middleware doesn't apply.
#[tauri::command]
pub async fn comfy_fetch(
    method: String,
    url: String,
    body: Option<String>,
) -> Result<ComfyResponse, String> {
    let client = reqwest::Client::new();
    let mut req = match method.as_str() {
        "POST" => client.post(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };
    if let Some(b) = body {
        req = req.header("Content-Type", "application/json").body(b);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok(ComfyResponse { status, body: text })
}

/// Let the webview load images from these folders via the asset protocol.
#[tauri::command]
pub fn allow_asset_dirs(app: AppHandle, dirs: Vec<String>) -> Result<(), String> {
    let scope = app.asset_protocol_scope();
    for d in dirs {
        let path = std::path::Path::new(&d);
        if path.is_dir() {
            scope
                .allow_directory(path, true)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
