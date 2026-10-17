param(
    [int]$Port = 3000,
    [switch]$NoWait
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$AppUrl = "http://localhost:$Port"
$HealthUrl = "$AppUrl/api/health"
$LogsDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

function Test-ServerReady {
    param([string]$Url)
    try {
        $req = [System.Net.HttpWebRequest]::Create($Url)
        $req.Method = "GET"
        $req.Timeout = 600
        $resp = [System.Net.HttpWebResponse]$req.GetResponse()
        $ok = ($resp.StatusCode -eq [System.Net.HttpStatusCode]::OK)
        $resp.Close()
        return $ok
    } catch {
        return $false
    }
}

$ServerReady = Test-ServerReady -Url $AppUrl
$StartedServerProcess = $null

if (-not $ServerReady) {
    $NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $NodeExe) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            "Node.js was not found in your PATH. Please install Node.js to run Comic Vault Box Manager.",
            "Comic Vault Box Manager",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
        exit 1
    }

    $ProdServerCjs = Join-Path $ProjectRoot "dist-server\server.cjs"
    $ProdIndexHtml = Join-Path $ProjectRoot "dist\index.html"
    $TsxCli = Join-Path $ProjectRoot "node_modules\tsx\dist\cli.mjs"
    $StdOutLog = Join-Path $LogsDir "server.log"
    $StdErrLog = Join-Path $LogsDir "server-error.log"

    # Use pre-built production server for ~1s instant cold start if up to date
    $UseProdBuild = (Test-Path $ProdServerCjs) -and (Test-Path $ProdIndexHtml)
    if ($UseProdBuild) {
        $BuildTime = (Get-Item $ProdServerCjs).LastWriteTime
        $NewerSource = Get-ChildItem -Path (Join-Path $ProjectRoot "src"), (Join-Path $ProjectRoot "server"), (Join-Path $ProjectRoot "server.ts") -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -gt $BuildTime } |
            Select-Object -First 1
        if ($NewerSource) {
            $UseProdBuild = $false
        }
    }

    if ($UseProdBuild) {
        $env:NODE_ENV = "production"
        $StartedServerProcess = Start-Process -FilePath $NodeExe `
            -ArgumentList @("`"$ProdServerCjs`"") `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $StdOutLog `
            -RedirectStandardError $StdErrLog `
            -PassThru
    } elseif (Test-Path $TsxCli) {
        $StartedServerProcess = Start-Process -FilePath $NodeExe `
            -ArgumentList @("`"$TsxCli`"", "server.ts") `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $StdOutLog `
            -RedirectStandardError $StdErrLog `
            -PassThru
    } else {
        $StartedServerProcess = Start-Process -FilePath "cmd.exe" `
            -ArgumentList @("/c", "npm run dev") `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $StdOutLog `
            -RedirectStandardError $StdErrLog `
            -PassThru
    }

    # Quick 1.5s check in case production server is ready immediately
    for ($i = 0; $i -lt 6; $i++) {
        if (Test-ServerReady -Url $HealthUrl) {
            $ServerReady = $true
            break
        }
        Start-Sleep -Milliseconds 250
    }
}

# Locate Chrome or Edge to launch as a standalone desktop app window
$BrowserCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)

$BrowserExe = $BrowserCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

# If the server is already responding, open the app URL directly;
# otherwise open the instant local splash screen which polls /api/health and auto-redirects once ready.
$SplashFile = Join-Path $ProjectRoot "assets\splash.html"
if ($ServerReady -or -not (Test-Path $SplashFile)) {
    $InitialUrl = $AppUrl
} else {
    $SplashUri = ([System.Uri]$SplashFile).AbsoluteUri
    $InitialUrl = "${SplashUri}?target=$([System.Uri]::EscapeDataString($AppUrl))"
}

if ($BrowserExe) {
    $AppProfileDir = Join-Path $env:LOCALAPPDATA "ComicVaultBoxManager\AppWindowProfile"
    if (-not (Test-Path $AppProfileDir)) {
        New-Item -ItemType Directory -Path $AppProfileDir -Force | Out-Null
    }

    $BrowserArgs = @(
        "--app=$InitialUrl",
        "--user-data-dir=`"$AppProfileDir`"",
        "--window-size=1440,920",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions"
    )

    $BrowserProc = Start-Process -FilePath $BrowserExe -ArgumentList $BrowserArgs -PassThru

    if (-not $NoWait -and $StartedServerProcess -and $BrowserProc) {
        # Wait for the standalone app window to close, then cleanly shut down the server we started
        $BrowserProc.WaitForExit()
        if (-not $StartedServerProcess.HasExited) {
            Stop-Process -Id $StartedServerProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    # Fallback to default system browser if neither Chrome nor Edge is found
    Start-Process $InitialUrl
}
