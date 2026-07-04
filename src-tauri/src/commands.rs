use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

/// Where Todly keeps config.json, presets/, and batches/. Defaults to a
/// `data` folder next to the running executable (so a portable copy of
/// Todly is fully self-contained); override with the TODLY_DATA env var
/// for development or multi-instance setups.
fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("TODLY_DATA") {
        return PathBuf::from(dir);
    }
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("data")))
        .unwrap_or_else(|| PathBuf::from("data"))
}

fn ensure_dir(p: &Path) -> Result<(), String> {
    fs::create_dir_all(p).map_err(|e| format!("create {}: {e}", p.display()))
}

#[tauri::command]
pub fn get_data_dir() -> String {
    data_dir().to_string_lossy().to_string()
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub comfy_host: String,
    pub comfy_port: u16,
    /// Path to the ComfyUI folder itself (contains main.py, models/, output/).
    /// Empty until the user sets it in Settings — there's no sane guess for
    /// where a given user installed ComfyUI, so we don't pretend to have one.
    pub comfy_root: String,
    pub output_dir: String,
    pub models_dir: String,
    pub default_preset_id: Option<String>,
    pub auto_launch_comfy: bool,
    // NOTE for future contributors: any API keys (Civitai, Hugging Face, ...)
    // belong as fields here, persisted only to the on-disk config.json (which
    // is gitignored — see .gitignore). Never hardcode a key in source, and
    // never bake one into a committed preset JSON.
}

impl Default for Config {
    fn default() -> Self {
        Config {
            comfy_host: "127.0.0.1".into(),
            comfy_port: 8188,
            comfy_root: String::new(),
            output_dir: String::new(),
            models_dir: String::new(),
            default_preset_id: Some("krea2-turbo".into()),
            auto_launch_comfy: false,
        }
    }
}

fn config_path() -> PathBuf {
    data_dir().join("config.json")
}

#[tauri::command]
pub fn get_config() -> Result<Config, String> {
    let path = config_path();
    if let Ok(raw) = fs::read_to_string(&path) {
        serde_json::from_str(&raw).map_err(|e| format!("config parse: {e}"))
    } else {
        let cfg = Config::default();
        ensure_dir(&data_dir())?;
        fs::write(&path, serde_json::to_string_pretty(&cfg).unwrap())
            .map_err(|e| e.to_string())?;
        Ok(cfg)
    }
}

#[tauri::command]
pub fn save_config(config: Config) -> Result<(), String> {
    ensure_dir(&data_dir())?;
    fs::write(
        config_path(),
        serde_json::to_string_pretty(&config).unwrap(),
    )
    .map_err(|e| e.to_string())
}

// ---------- Presets ----------

fn presets_dir() -> PathBuf {
    data_dir().join("presets")
}

fn safe_id(id: &str) -> Result<String, String> {
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("invalid preset id: {id}"));
    }
    Ok(id.to_string())
}

/// Shipped starter preset, embedded at compile time so it reaches the
/// user's data dir regardless of where that ends up (see `data_dir`).
const STARTER_PRESET: &str = include_str!("../../data/presets/krea2-turbo.json");

/// Write the starter preset into a fresh data dir exactly once. Guarded by
/// a marker file so deleting it later (to start clean) sticks.
fn seed_starter_preset(dir: &Path) -> Result<(), String> {
    let marker = dir.join(".seeded");
    if marker.exists() {
        return Ok(());
    }
    let target = dir.join("krea2-turbo.json");
    if !target.exists() {
        fs::write(&target, STARTER_PRESET).map_err(|e| e.to_string())?;
    }
    fs::write(&marker, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_presets() -> Result<Vec<Value>, String> {
    let dir = presets_dir();
    ensure_dir(&dir)?;
    seed_starter_preset(&dir)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            match fs::read_to_string(&path)
                .map_err(|e| e.to_string())
                .and_then(|raw| serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string()))
            {
                Ok(v) => out.push(v),
                Err(e) => eprintln!("skipping preset {}: {e}", path.display()),
            }
        }
    }
    out.sort_by(|a, b| {
        let an = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let bn = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        an.cmp(bn)
    });
    Ok(out)
}

#[tauri::command]
pub fn save_preset(preset: Value) -> Result<(), String> {
    let id = preset
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("preset missing id")?;
    let id = safe_id(id)?;
    let dir = presets_dir();
    ensure_dir(&dir)?;
    fs::write(
        dir.join(format!("{id}.json")),
        serde_json::to_string_pretty(&preset).unwrap(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_preset(id: String) -> Result<(), String> {
    let id = safe_id(&id)?;
    let path = presets_dir().join(format!("{id}.json"));
    fs::remove_file(&path).map_err(|e| e.to_string())
}

// ---------- Gallery ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItem {
    pub file_name: String,
    pub subfolder: String,
    pub path: String,
    pub size: u64,
    pub modified_ms: u64,
}

const IMAGE_EXTS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "gif"];

fn walk_images(root: &Path, dir: &Path, out: &mut Vec<GalleryItem>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_images(root, &path, out);
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if !IMAGE_EXTS.contains(&ext.as_str()) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let subfolder = path
            .parent()
            .and_then(|p| p.strip_prefix(root).ok())
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        out.push(GalleryItem {
            file_name: entry.file_name().to_string_lossy().to_string(),
            subfolder,
            path: path.to_string_lossy().to_string(),
            size: meta.len(),
            modified_ms,
        });
    }
}

#[tauri::command]
pub fn list_gallery(output_dir: String) -> Result<Vec<GalleryItem>, String> {
    let root = PathBuf::from(&output_dir);
    if !root.is_dir() {
        return Err(format!("output folder not found: {output_dir}"));
    }
    let mut out = Vec::new();
    walk_images(&root, &root, &mut out);
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    out.truncate(3000);
    Ok(out)
}

// ---------- PNG metadata (ComfyUI embeds prompt/workflow in tEXt chunks) ----------

#[derive(Serialize, Default)]
pub struct ImageMetadata {
    pub prompt: Option<String>,
    pub workflow: Option<String>,
}

#[tauri::command]
pub fn read_image_metadata(path: String) -> Result<ImageMetadata, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let mut meta = ImageMetadata::default();
    const PNG_SIG: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    if bytes.len() < 8 || bytes[..8] != PNG_SIG {
        return Ok(meta); // not a PNG — no metadata
    }
    let mut pos = 8usize;
    while pos + 12 <= bytes.len() {
        let len = u32::from_be_bytes([bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]])
            as usize;
        let ctype = &bytes[pos + 4..pos + 8];
        if pos + 12 + len > bytes.len() {
            break;
        }
        let data = &bytes[pos + 8..pos + 8 + len];
        if ctype == b"tEXt" {
            if let Some(nul) = data.iter().position(|&b| b == 0) {
                let key = String::from_utf8_lossy(&data[..nul]).to_string();
                let text = String::from_utf8_lossy(&data[nul + 1..]).to_string();
                match key.as_str() {
                    "prompt" => meta.prompt = Some(text),
                    "workflow" => meta.workflow = Some(text),
                    _ => {}
                }
            }
        } else if ctype == b"IDAT" || ctype == b"IEND" {
            break; // metadata chunks precede image data in ComfyUI files
        }
        pos += 12 + len;
    }
    Ok(meta)
}

// ---------- Batch manifests ----------

fn batches_dir() -> PathBuf {
    data_dir().join("batches")
}

#[tauri::command]
pub fn save_batch_manifest(manifest: Value) -> Result<(), String> {
    let id = manifest
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("manifest missing id")?;
    let id = safe_id(id)?;
    let dir = batches_dir();
    ensure_dir(&dir)?;
    fs::write(
        dir.join(format!("{id}.json")),
        serde_json::to_string_pretty(&manifest).unwrap(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_batch_manifests() -> Result<Vec<Value>, String> {
    let dir = batches_dir();
    ensure_dir(&dir)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(raw) = fs::read_to_string(&path) {
                if let Ok(v) = serde_json::from_str::<Value>(&raw) {
                    out.push(v);
                }
            }
        }
    }
    out.sort_by(|a, b| {
        let ac = a.get("createdAt").and_then(|v| v.as_str()).unwrap_or("");
        let bc = b.get("createdAt").and_then(|v| v.as_str()).unwrap_or("");
        bc.cmp(ac)
    });
    Ok(out)
}

// ---------- Misc ----------

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelFile {
    pub name: String,
    pub folder: String,
    pub size: u64,
}

/// List model files grouped by top-level subfolder (checkpoints, loras, vae, ...).
#[tauri::command]
pub fn list_model_files(models_dir: String) -> Result<Vec<ModelFile>, String> {
    let root = PathBuf::from(&models_dir);
    if !root.is_dir() {
        return Err(format!("models folder not found: {models_dir}"));
    }
    let mut out = Vec::new();
    for sub in fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
        let sub_path = sub.path();
        if !sub_path.is_dir() {
            continue;
        }
        let folder = sub.file_name().to_string_lossy().to_string();
        let mut stack = vec![sub_path.clone()];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                    continue;
                }
                let Ok(meta) = entry.metadata() else { continue };
                if meta.len() < 1024 {
                    continue; // skip placeholder files
                }
                let rel = path
                    .strip_prefix(&sub_path)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| entry.file_name().to_string_lossy().to_string());
                out.push(ModelFile {
                    name: rel,
                    folder: folder.clone(),
                    size: meta.len(),
                });
            }
        }
    }
    out.sort_by(|a, b| a.folder.cmp(&b.folder).then(b.size.cmp(&a.size)));
    Ok(out)
}

#[tauri::command]
pub fn delete_image(path: String, output_dir: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let root = PathBuf::from(&output_dir);
    // only allow deleting files inside the configured output folder
    let canon_p = p.canonicalize().map_err(|e| e.to_string())?;
    let canon_root = root.canonicalize().map_err(|e| e.to_string())?;
    if !canon_p.starts_with(&canon_root) {
        return Err("refusing to delete outside the output folder".into());
    }
    fs::remove_file(&canon_p).map_err(|e| e.to_string())
}
