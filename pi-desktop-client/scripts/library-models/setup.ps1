param([string]$Python = 'python', [string]$RuntimeDirectory = '', [string]$ModelsDirectory = '')
$ErrorActionPreference = 'Stop'
$clientRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$runtimePath = if ($RuntimeDirectory) { [IO.Path]::GetFullPath($RuntimeDirectory) } else { Join-Path $clientRoot '.cache/library-model-runtime' }
if ($ModelsDirectory) { $env:PI_LIBRARY_MODELS = [IO.Path]::GetFullPath($ModelsDirectory) }
if (!(Test-Path -LiteralPath (Join-Path $runtimePath 'Scripts/python.exe'))) {
  & $Python -m venv $runtimePath
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create isolated Python environment' }
}
$runtimePython = Join-Path $runtimePath 'Scripts/python.exe'
& $runtimePython -m pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cu124
if ($LASTEXITCODE -ne 0) { throw 'CUDA PyTorch installation failed' }
& $runtimePython -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Transformers installation failed' }
& $runtimePython (Join-Path $PSScriptRoot 'download.py')
if ($LASTEXITCODE -ne 0) { throw 'Model download failed' }
Write-Host 'Ready. Run npm.cmd run library:models from the client directory.'
