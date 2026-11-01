# Publishes Hyrule Atlas to GitHub in one go:
#   1. rebuilds README / LICENSE / release notes from the current build
#   2. commits and pushes the project to your GitHub repo (creates it if needed)
#   3. creates the GitHub Release and uploads the installer + portable zip from dist\
#
# Easiest way to run it: double-click publish-hyrule-atlas.bat
# Or, from this folder:
#   powershell -ExecutionPolicy Bypass -File .\publish-hyrule-atlas.ps1
#
# Options:
#   -Repo "KyDaog/hyrule-atlas"   which GitHub repo to use
#   -Private                      create the repo as private (default is public)
#   -NoRelease                    only push the code, skip the Release

param(
  [string]$Repo = 'KyDaog/hyrule-atlas',
  [switch]$Private,
  [switch]$NoRelease
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Need([string]$cmd, [string]$hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "'$cmd' was not found. $hint"
  }
}

function Run([string]$exe, [string[]]$arguments) {
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "Command failed: $exe $($arguments -join ' ')" }
}

function Quiet([string]$exe, [string[]]$arguments) {
  & $exe @arguments 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

Write-Host ''
Write-Host '=== Hyrule Atlas: publish to GitHub ===' -ForegroundColor Yellow

Need 'node' 'Install Node.js from https://nodejs.org'
Need 'git'  'Install Git from https://git-scm.com/download/win'
Need 'gh'   'Install the GitHub CLI from https://cli.github.com (or run: winget install GitHub.cli)'

if (-not (Test-Path 'package.json')) { throw 'Run this from the Hyrule Atlas project folder (package.json not found).' }
if (-not (Test-Path 'tools\make-github-page.js')) { throw 'tools\make-github-page.js is missing. Unzip the GitHub pack into the project folder first.' }

# --- 1. GitHub login ---------------------------------------------------------
if (-not (Quiet 'gh' @('auth', 'status'))) {
  Write-Host 'You are not logged in to GitHub yet. A browser window will open to sign in.' -ForegroundColor Cyan
  Run 'gh' @('auth', 'login', '--web', '--git-protocol', 'https')
}
Run 'gh' @('auth', 'setup-git')

# --- 2. Rebuild the page files -----------------------------------------------
Write-Host ''
Write-Host 'Rebuilding README, LICENSE and release notes...' -ForegroundColor Cyan
Run 'node' @('tools\make-github-page.js')
$version = (& node -p "require('./package.json').version").Trim()
$tag = "v$version"
Write-Host "Version: $version"

# --- 3. Commit ---------------------------------------------------------------
if (-not (Test-Path '.git')) {
  Run 'git' @('init')
  Run 'git' @('branch', '-M', 'main')
}

# Use GitHub's private "noreply" address so your real email is never published.
$name = (& git config user.name 2>$null)
$mail = (& git config user.email 2>$null)
if (-not $name) { Run 'git' @('config', 'user.name', 'KyDa') }
if (-not $mail) {
  $id = (& gh api user --jq '.id').Trim()
  $login = (& gh api user --jq '.login').Trim()
  Run 'git' @('config', 'user.email', "$id+$login@users.noreply.github.com")
}

Run 'git' @('add', '-A')

# GitHub rejects any single file over 100 MB. Catch that before it breaks the push.
$tooBig = @()
foreach ($f in (& git diff --cached --name-only)) {
  if ((Test-Path -LiteralPath $f) -and ((Get-Item -LiteralPath $f).Length -gt 95MB)) { $tooBig += $f }
}
if ($tooBig.Count -gt 0) {
  Run 'git' @('reset')
  throw ("These files are over GitHub's 100 MB limit: " + ($tooBig -join ', ') + "`nAdd them to .gitignore and run this again.")
}

if (-not (Quiet 'git' @('diff', '--cached', '--quiet'))) {
  Run 'git' @('commit', '-m', "Hyrule Atlas $version")
} else {
  Write-Host 'Nothing new to commit.'
}

# --- 4. Repo + push ----------------------------------------------------------
$hasRemote = Quiet 'git' @('remote', 'get-url', 'origin')
if (-not $hasRemote) {
  if (Quiet 'gh' @('repo', 'view', $Repo)) {
    Run 'git' @('remote', 'add', 'origin', "https://github.com/$Repo.git")
  } else {
    $visibility = if ($Private) { '--private' } else { '--public' }
    Write-Host "Creating github.com/$Repo ..." -ForegroundColor Cyan
    Run 'gh' @('repo', 'create', $Repo, $visibility, '--source', '.', '--remote', 'origin',
               '--description', 'A completely offline, interactive Breath of the Wild map and 100% completion tracker for Windows.')
  }
}
Write-Host 'Pushing...' -ForegroundColor Cyan
Run 'git' @('push', '-u', 'origin', 'main')

# --- 5. Release --------------------------------------------------------------
if ($NoRelease) {
  Write-Host ''
  Write-Host "Done. Code pushed to https://github.com/$Repo" -ForegroundColor Green
  exit 0
}

$assets = @()
$assets += Get-ChildItem -LiteralPath 'dist' -Filter "Hyrule-Atlas-Setup-$version.exe" -ErrorAction SilentlyContinue
$assets += Get-ChildItem -LiteralPath 'dist' -Filter "Hyrule-Atlas-Portable-$version.zip" -ErrorAction SilentlyContinue
if ($assets.Count -eq 0) {
  Write-Host ''
  Write-Host "No installer for version $version found in dist\." -ForegroundColor Yellow
  Write-Host 'Build it first with:  npm.cmd run dist:all   then run this script again.'
  Write-Host "(The code is already pushed to https://github.com/$Repo)"
  exit 0
}

$paths = $assets | ForEach-Object { $_.FullName }
if (Quiet 'gh' @('release', 'view', $tag, '--repo', $Repo)) {
  Write-Host "Release $tag already exists, updating its files and notes..." -ForegroundColor Cyan
  Run 'gh' (@('release', 'upload', $tag, '--repo', $Repo, '--clobber') + $paths)
  Run 'gh' @('release', 'edit', $tag, '--repo', $Repo, '--title', "Hyrule Atlas $version", '--notes-file', 'RELEASE_NOTES.md')
} else {
  Write-Host "Creating release $tag ..." -ForegroundColor Cyan
  Run 'gh' (@('release', 'create', $tag, '--repo', $Repo, '--title', "Hyrule Atlas $version", '--notes-file', 'RELEASE_NOTES.md') + $paths)
}

Write-Host ''
Write-Host 'All done!' -ForegroundColor Green
Write-Host "Page:     https://github.com/$Repo"
Write-Host "Release:  https://github.com/$Repo/releases/tag/$tag"
