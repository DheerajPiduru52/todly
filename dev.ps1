# Todly dev launcher — keeps all build caches inside the project folder
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:CARGO_HOME = Join-Path $root ".cargo-home"
Set-Location $root
pnpm tauri dev
