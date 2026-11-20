param([string]$Python = '.\.venv\Scripts\python.exe', [string]$Output = 'release', [string]$Work = 'build')
$ErrorActionPreference='Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not (Test-Path 'frontend\dist\index.html')) { throw 'Build the frontend first.' }
& $Python -m PyInstaller --noconfirm --onedir --name GeoCheck --distpath $Output --workpath $Work --specpath $Work --paths "$root/backend" --hidden-import uvicorn.logging --hidden-import uvicorn.loops.auto --hidden-import uvicorn.protocols.http.auto --hidden-import uvicorn.protocols.websockets.auto --hidden-import uvicorn.lifespan.on --collect-all sklearn --collect-all scipy --collect-data pandas --collect-all lasio --add-data "${root}/frontend/dist:frontend/dist" --add-data "${root}/data/demo:data/demo" --add-data "${root}/docs/licenses:licenses" "$root/scripts/desktop.py"
if ($LASTEXITCODE -ne 0) { throw 'Windows build failed.' }
& $Python "$root/scripts/collect-licenses.py" "$Output/GeoCheck/_internal/licenses/dependencies"
if ($LASTEXITCODE -ne 0) { throw 'License collection failed.' }
# Some build interpreters load an additional public CA policy file from ssl.py.
# Preserve that policy in the bundle rather than modifying TLS verification.
$sslFolder = & $Python -c 'import ssl; from pathlib import Path; print(Path(ssl.__file__).parent)'
$caPolicy = Join-Path $sslFolder 'codex-rejected-cas.pem'
if (Test-Path -LiteralPath $caPolicy) { Copy-Item -LiteralPath $caPolicy -Destination "$Output/GeoCheck/_internal/codex-rejected-cas.pem" }
Write-Host 'Bundle ready. Include the entire GeoCheck folder, not only GeoCheck.exe.'
