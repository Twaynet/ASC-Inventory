$ErrorActionPreference = "Stop"

$repoRoot  = "C:\Users\missp\source\repos\ASC-Inventory"
$promptDir = Join-Path $repoRoot "docs\SNAPSHOTS"
$outRoot   = Join-Path $repoRoot "docs\SNAPSHOTS"

$prompts = @(
  "SNAPSHOT_API.md"
  "SNAPSHOT_AUTHORIZATION.md"
  "SNAPSHOT_CONFIGURATION.md"
  "SNAPSHOT_DATABASE.md"
  "SNAPSHOT_NAVIGATION.md"
  "SNAPSHOT_ROUTING.md"
  "SNAPSHOT_WORKFLOW.md"
)

# Output folders
$stamp   = Get-Date -Format "yyyyMMdd_HHmmss"
$runDir  = Join-Path $outRoot ("run_" + $stamp)
$latestDir = Join-Path $outRoot "LATEST"

New-Item -ItemType Directory -Force -Path $runDir     | Out-Null
New-Item -ItemType Directory -Force -Path $latestDir  | Out-Null

function OutNameFromPrompt($promptFile) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($promptFile) # SNAPSHOT_API
  $short = $base.Replace("SNAPSHOT_","")                              # API
  return "snapshot_$short.txt"
}

function Run-One($promptPath, $archiveOutPath, $latestOutPath) {
  Write-Host "Running: $promptPath" -ForegroundColor Cyan
  $start = Get-Date

  # Capture stdout + stderr so failures are recorded in the snapshot itself
  & claude -p (Get-Content -Raw $promptPath) 2>&1 | Tee-Object -FilePath $latestOutPath | Out-File $archiveOutPath -Encoding utf8

  $elapsed = (Get-Date) - $start
  Write-Host "Wrote: $archiveOutPath" -ForegroundColor Green
  Write-Host "Latest: $latestOutPath" -ForegroundColor DarkGreen
  Write-Host "Time:  $([int]$elapsed.TotalMinutes)m $([int]$elapsed.Seconds)s`n" -ForegroundColor Gray
}

foreach ($p in $prompts) {
  $promptPath = Join-Path $promptDir $p
  $outFile    = OutNameFromPrompt $p

  $archiveOut = Join-Path $runDir $outFile
  $latestOut  = Join-Path $latestDir $outFile

  if (!(Test-Path $promptPath)) {
    "ERROR: Missing prompt file: $promptPath" | Out-File $archiveOut -Encoding utf8
    "ERROR: Missing prompt file: $promptPath" | Out-File $latestOut  -Encoding utf8
    Write-Host "Missing: $promptPath (wrote error files)" -ForegroundColor Yellow
    continue
  }

  Run-One $promptPath $archiveOut $latestOut
}

Write-Host "DONE." -ForegroundColor Magenta
Write-Host "Archive folder: $runDir" -ForegroundColor Magenta
Write-Host "Latest folder:  $latestDir" -ForegroundColor Magenta
