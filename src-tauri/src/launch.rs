use std::io::{BufRead, BufReader};
use std::net::{TcpStream, ToSocketAddrs};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Guards against spawning a second ComfyUI process while one is already booting.
pub struct LaunchState(pub Mutex<bool>);

fn probe_port(host: &str, port: u16) -> bool {
    let addr = format!("{host}:{port}");
    match addr.to_socket_addrs() {
        Ok(mut addrs) => addrs
            .next()
            .map(|a| TcpStream::connect_timeout(&a, Duration::from_millis(600)).is_ok())
            .unwrap_or(false),
        Err(_) => false,
    }
}

/// Launch ComfyUI's embedded Python directly — never touches run.bat's
/// "kill anything on the port" step, so an already-running server (started
/// by the user, or by a previous Todly launch) is left alone.
#[tauri::command]
pub fn comfy_launch(
    app: AppHandle,
    state: tauri::State<'_, LaunchState>,
    comfy_root: String,
    host: String,
    port: u16,
) -> Result<String, String> {
    {
        let mut launching = state.0.lock().map_err(|e| e.to_string())?;
        if *launching {
            return Ok("already_launching".into());
        }
        if probe_port(&host, port) {
            return Ok("already_running".into());
        }
        *launching = true;
    }

    let comfy_path = std::path::PathBuf::from(&comfy_root);
    let portable_root = match comfy_path.parent() {
        Some(p) => p.to_path_buf(),
        None => {
            *state.0.lock().unwrap() = false;
            return Err(
                "Couldn't determine the portable install root from the ComfyUI path".into(),
            );
        }
    };
    let python_exe = portable_root.join("python_embeded").join("python.exe");
    let main_py = comfy_path.join("main.py");

    if !python_exe.is_file() || !main_py.is_file() {
        *state.0.lock().unwrap() = false;
        return Err(format!(
            "Expected {} and {} — check the ComfyUI folder in Settings",
            python_exe.display(),
            main_py.display()
        ));
    }

    let mut cmd = Command::new(&python_exe);
    cmd.arg("-s")
        .arg(&main_py)
        .arg("--windows-standalone-build")
        .arg("--highvram")
        .current_dir(&comfy_path)
        .env_remove("ALL_PROXY")
        .env_remove("HTTP_PROXY")
        .env_remove("HTTPS_PROXY")
        .env("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
        .env("CUDA_VISIBLE_DEVICES", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            *state.0.lock().unwrap() = false;
            return Err(format!("Failed to launch python.exe: {e}"));
        }
    };

    if let Some(out) = child.stdout.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                let _ = app2.emit("comfy-boot-log", line);
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                let _ = app2.emit("comfy-boot-log", line);
            }
        });
    }

    let app3 = app.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|s| s.code());
        if let Some(launch_state) = app3.try_state::<LaunchState>() {
            if let Ok(mut launching) = launch_state.0.lock() {
                *launching = false;
            }
        }
        let _ = app3.emit("comfy-boot-exit", code);
    });

    Ok("launching".into())
}
