# Todly release build — keeps all build caches inside the project folder
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:CARGO_HOME = Join-Path $root ".cargo-home"
Set-Location $root
pnpm tauri build
Write-Host ""
Write-Host "Installer: $root\src-tauri\target\release\bundle\nsis\" -ForegroundColor Green
Write-Host "Portable exe: $root\src-tauri\target\release\todly.exe" -ForegroundColor Green
