mod commands;
mod launch;
mod ws;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(ws::WsState(std::sync::Mutex::new(None)))
        .manage(launch::LaunchState(std::sync::Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![
            ws::ws_start,
            ws::allow_asset_dirs,
            ws::comfy_fetch,
            launch::comfy_launch,
            commands::get_config,
            commands::save_config,
            commands::get_data_dir,
            commands::list_presets,
            commands::save_preset,
            commands::delete_preset,
            commands::list_gallery,
            commands::read_image_metadata,
            commands::read_text_file,
            commands::write_text_file,
            commands::save_batch_manifest,
            commands::list_batch_manifests,
            commands::list_model_files,
            commands::delete_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Todly");
}
