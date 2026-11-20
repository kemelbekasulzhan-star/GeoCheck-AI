param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

try {
    Write-Host 'GeoCheck AI - Windows installation'
    Write-Host 'The first installation needs internet. Your existing datasets will be preserved.'
    $pythonExe = $null
    $pythonArgs = @()
    if (Test-Path -LiteralPath '.venv\Scripts\python.exe') {
        $pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'
    } else {
        foreach ($candidate in @('py.exe', 'python.exe', 'python3.exe')) {
            $command = Get-Command $candidate -ErrorAction SilentlyContinue
            if (-not $command) { continue }
            if ($command.Source -like '*\Microsoft\WindowsApps\*') { continue }
            $candidateArgs = @()
            if ($candidate -eq 'py.exe') { $candidateArgs = @('-3.12') }
            try {
                & $command.Source @candidateArgs -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3,12) else 1)' 2>$null
            } catch { continue }
            if ($LASTEXITCODE -eq 0) {
                $pythonExe = $command.Source
                $pythonArgs = $candidateArgs
                break
            }
        }
    }
    if (-not $pythonExe) { throw 'Install Python 3.12 x64 from https://www.python.org/downloads/windows/ . Enable Add Python to PATH, then run this installer again.' }
    & $pythonExe @pythonArgs -c 'import sys; print(sys.version); sys.exit(0 if sys.version_info[:2] == (3,12) else 1)'
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 is required. A copied .venv cannot be reused on another PC. Keep your files and extract a fresh GitHub ZIP into a new folder.' }
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $node -or -not $npm) { throw 'Install Node.js 22.12+ or 24 with npm from https://nodejs.org/ . Reopen the installer afterwards.' }
    $nodeVersion = & $node.Source -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0) { throw 'Could not read Node.js version.' }
    Write-Host ('Node: ' + $nodeVersion)
    $nodeParts = $nodeVersion.Split('.')
    if (-not (([int]$nodeParts[0] -eq 22 -and [int]$nodeParts[1] -ge 12) -or [int]$nodeParts[0] -eq 24)) { throw 'Use Node.js 22.12+ (22.x) or 24.x for this project.' }
    if ($CheckOnly) { Write-Host 'PASS: installation prerequisites are available.'; exit 0 }
    if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
        & $pythonExe @pythonArgs -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not create Python environment. Check free space and write permissions.' }
    }
    & '.\.venv\Scripts\python.exe' -m pip --version
    if ($LASTEXITCODE -ne 0) {
        & '.\.venv\Scripts\python.exe' -m ensurepip --upgrade
        if ($LASTEXITCODE -ne 0) { throw 'pip is unavailable. Repair the Python 3.12 installation, then retry.' }
    }
    & '.\.venv\Scripts\python.exe' -m pip install -r backend\requirements-lock.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python package installation failed. Check the network and the pip error above.' }
    & $npm.Source ci --prefix frontend
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed. Check the npm error above.' }
    & $npm.Source run build --prefix frontend
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed. Check the build error above.' }
    & '.\.venv\Scripts\python.exe' scripts\launch.py --check
    if ($LASTEXITCODE -ne 0) { throw 'Installed files did not pass the startup check.' }
    Write-Host 'Installation completed. Start-GeoCheck.cmd opens the local application.'
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
