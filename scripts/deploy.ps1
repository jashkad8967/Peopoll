# =============================================================================
# Peopoll deployment script
#
# One command to ship an update to any/all targets:
#   - web    : Expo web export  ->  Firebase Hosting  (the peopollapp website)
#   - rules  : Firestore security rules + indexes
#   - mobile : iOS / Android via EAS (store build+submit, or OTA update)
#
# Examples (run from the project root in PowerShell):
#   ./scripts/deploy.ps1                       # web + rules (fast, default)
#   ./scripts/deploy.ps1 -Target all           # web + rules + mobile store build
#   ./scripts/deploy.ps1 -Target web           # just the website
#   ./scripts/deploy.ps1 -Target mobile -Update  # OTA push (needs EAS Update enabled)
#   ./scripts/deploy.ps1 -Target mobile -Platform android
#   ./scripts/deploy.ps1 -Target all -Bump patch -Message "Fix vote sync"
#
# Prerequisites (install once):
#   npm install -g firebase-tools eas-cli
#   firebase login    &&    eas login
# =============================================================================

[CmdletBinding()]
param(
    # What to ship. "all" = web + rules + mobile.
    [ValidateSet('web', 'rules', 'mobile', 'all')]
    [string]$Target = 'web+rules',

    # Mobile only: which platforms to build/submit/update.
    [ValidateSet('android', 'ios', 'all')]
    [string]$Platform = 'all',

    # EAS build/submit profile (see eas.json).
    [ValidateSet('production', 'preview', 'development')]
    [string]$Profile = 'production',

    # Mobile: push an over-the-air JS update (eas update) instead of a full
    # store build. Requires "updates.enabled": true in app.json.
    [switch]$Update,

    # Mobile: also submit the finished build to the app stores.
    [switch]$Submit,

    # Optional semantic version bump applied to app.json + package.json before shipping.
    [ValidateSet('none', 'patch', 'minor', 'major')]
    [string]$Bump = 'none',

    # Message used for the git commit and the EAS OTA update note.
    [string]$Message = '',

    # Skip "npm install" (use when deps are already current).
    [switch]$SkipInstall,

    # Print what would run without executing anything.
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# --- helpers ----------------------------------------------------------------
function Write-Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Write-Info($text) { Write-Host "  $text" -ForegroundColor DarkGray }

function Invoke-Step($label, [scriptblock]$action) {
    Write-Step $label
    if ($DryRun) {
        Write-Host "  [dry-run] $($action.ToString().Trim())" -ForegroundColor Yellow
        return
    }
    & $action
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $label (exit code $LASTEXITCODE)"
    }
}

function Require-Command($name, $hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "'$name' is not installed or not on PATH. $hint"
    }
}

# Normalise the default (param sets can't express "web+rules" cleanly).
$doWeb = $false; $doRules = $false; $doMobile = $false
switch ($Target) {
    'web'      { $doWeb = $true }
    'rules'    { $doRules = $true }
    'mobile'   { $doMobile = $true }
    'all'      { $doWeb = $true; $doRules = $true; $doMobile = $true }
    default    { $doWeb = $true; $doRules = $true }  # web+rules
}

Write-Host "Peopoll deploy" -ForegroundColor Green
Write-Info "Targets: web=$doWeb rules=$doRules mobile=$doMobile"
Write-Info "Profile=$Profile Platform=$Platform Update=$Update Submit=$Submit Bump=$Bump DryRun=$DryRun"

# --- 0) optional version bump ----------------------------------------------
if ($Bump -ne 'none') {
    Invoke-Step "Bumping version ($Bump)" {
        $appJsonPath = Join-Path $repoRoot 'app.json'
        $pkgJsonPath = Join-Path $repoRoot 'package.json'

        $app = Get-Content $appJsonPath -Raw | ConvertFrom-Json
        $current = $app.expo.version
        $parts = $current.Split('.')
        [int]$major = $parts[0]; [int]$minor = $parts[1]; [int]$patch = $parts[2]
        switch ($using:Bump) {
            'patch' { $patch++ }
            'minor' { $minor++; $patch = 0 }
            'major' { $major++; $minor = 0; $patch = 0 }
        }
        $next = "$major.$minor.$patch"

        # app.json (expo.version drives the store display version)
        $app.expo.version = $next
        ($app | ConvertTo-Json -Depth 30) | Set-Content $appJsonPath -Encoding UTF8

        # package.json
        $pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
        $pkg.version = $next
        ($pkg | ConvertTo-Json -Depth 30) | Set-Content $pkgJsonPath -Encoding UTF8

        Write-Host "  $current -> $next" -ForegroundColor Green
    }
}

# --- 1) install deps --------------------------------------------------------
if (-not $SkipInstall) {
    Require-Command 'npm' 'Install Node.js from https://nodejs.org.'
    Invoke-Step 'Installing dependencies' { npm install }
}

# --- 2) WEB: export + Firebase Hosting -------------------------------------
if ($doWeb) {
    Require-Command 'npx' 'Comes with Node.js.'
    Require-Command 'firebase' 'Install with: npm install -g firebase-tools (then: firebase login).'

    Invoke-Step 'Exporting web bundle (expo export)' {
        # Produces the static site in ./dist, which firebase.json serves.
        npx expo export --platform web --output-dir dist
    }
    # expo export rewrites dist/, so re-copy the standalone privacy policy page
    # afterwards. This keeps https://<host>/privacy.html live for the app
    # stores' required privacy-policy URL.
    Invoke-Step 'Copying privacy policy into dist' {
        $src = Join-Path $repoRoot 'public/privacy.html'
        $dest = Join-Path $repoRoot 'dist/privacy.html'
        if (Test-Path $src) { Copy-Item $src $dest -Force }
    }
    Invoke-Step 'Deploying website to Firebase Hosting' {
        firebase deploy --only hosting
    }
}

# --- 3) RULES: Firestore rules + indexes -----------------------------------
if ($doRules) {
    Require-Command 'firebase' 'Install with: npm install -g firebase-tools (then: firebase login).'
    Invoke-Step 'Deploying Firestore rules + indexes' {
        firebase deploy --only firestore
    }
}

# --- 4) MOBILE: EAS OTA update or store build/submit -----------------------
if ($doMobile) {
    Require-Command 'eas' 'Install with: npm install -g eas-cli (then: eas login).'
    $easPlatform = $Platform  # eas accepts android|ios|all

    if ($Update) {
        # Over-the-air JS/asset update — instant, no app-store review.
        # NOTE: requires "updates": { "enabled": true } in app.json.
        $note = if ($Message) { $Message } else { "Update $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
        Invoke-Step "Publishing OTA update (eas update, $easPlatform)" {
            eas update --branch $using:Profile --platform $using:easPlatform --message $using:note --non-interactive
        }
    }
    else {
        # Full native build (new binary for the stores).
        Invoke-Step "Building native app (eas build, $easPlatform / $Profile)" {
            eas build --platform $using:easPlatform --profile $using:Profile --non-interactive
        }
        if ($Submit) {
            Invoke-Step "Submitting to stores (eas submit, $easPlatform)" {
                eas submit --platform $using:easPlatform --profile $using:Profile --non-interactive
            }
        }
    }
}

# --- 5) optional git commit for the version bump ---------------------------
if ($Bump -ne 'none' -and -not $DryRun) {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Step 'Committing version bump'
        $commitMsg = if ($Message) { "release: $Message" } else { "release: version bump ($Bump)" }
        git add app.json package.json | Out-Null
        git commit -m $commitMsg | Out-Null
        Write-Host "  Committed: $commitMsg" -ForegroundColor Green
        Write-Info "Run 'git push' to publish the commit (and tags) to your remote."
    }
}

Write-Host "`nDeploy finished." -ForegroundColor Green
if ($DryRun) { Write-Host "(dry-run: nothing was actually deployed)" -ForegroundColor Yellow }
