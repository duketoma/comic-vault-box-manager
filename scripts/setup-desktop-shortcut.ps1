$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AssetsDir = Join-Path $ProjectRoot "assets"
$PublicDir = Join-Path $ProjectRoot "public"

if (-not (Test-Path $AssetsDir)) { New-Item -ItemType Directory -Path $AssetsDir -Force | Out-Null }
if (-not (Test-Path $PublicDir)) { New-Item -ItemType Directory -Path $PublicDir -Force | Out-Null }

$IconPath = Join-Path $AssetsDir "comic-vault.ico"
$FaviconPath = Join-Path $PublicDir "favicon.ico"

# Generate a crisp 256x256 custom Comic Vault icon (PNG-compressed ICO format)
$Size = 256
$Bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$G = [System.Drawing.Graphics]::FromImage($Bmp)
$G.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$G.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$G.Clear([System.Drawing.Color]::Transparent)

# Helper for rounded rectangle path
function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

# Outer dark slate vault tile with indigo/amber border
$OuterPath = New-RoundedRectPath 12 12 232 232 48
$BgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF(0, 0)),
    (New-Object System.Drawing.PointF(256, 256)),
    [System.Drawing.Color]::FromArgb(255, 15, 23, 42),
    [System.Drawing.Color]::FromArgb(255, 30, 27, 75)
)
$G.FillPath($BgBrush, $OuterPath)

$BorderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 245, 158, 11), 6)
$G.DrawPath($BorderPen, $OuterPath)

# Comic Box base body
$BoxBodyPath = New-RoundedRectPath 48 98 160 110 16
$BoxBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF(48, 98)),
    (New-Object System.Drawing.PointF(48, 208)),
    [System.Drawing.Color]::FromArgb(255, 251, 191, 36),
    [System.Drawing.Color]::FromArgb(255, 217, 119, 6)
)
$G.FillPath($BoxBrush, $BoxBodyPath)

# Comic Box lid
$LidPath = New-RoundedRectPath 38 74 180 30 10
$LidBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 252, 211, 77))
$G.FillPath($LidBrush, $LidPath)

# Comic pages peeking above the box lid
$Page1Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 239, 68, 68))
$Page2Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 59, 130, 246))
$Page3Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
$G.FillRectangle($Page1Brush, 64, 44, 38, 30)
$G.FillRectangle($Page2Brush, 108, 38, 42, 36)
$G.FillRectangle($Page3Brush, 154, 46, 36, 28)

# Box handle cutout & "CV" emblem on box front
$HandlePath = New-RoundedRectPath 98 118 60 18 9
$HandleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
$G.FillPath($HandleBrush, $HandlePath)

$Font = New-Object System.Drawing.Font("Segoe UI", 34, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$TextFormat = New-Object System.Drawing.StringFormat
$TextFormat.Alignment = [System.Drawing.StringAlignment]::Center
$TextFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
$G.DrawString("VAULT", $Font, $HandleBrush, (New-Object System.Drawing.RectangleF(48, 144, 160, 56)), $TextFormat)

# Encode 256x256 PNG into valid Windows .ICO container
$PngStream = New-Object System.IO.MemoryStream
$Bmp.Save($PngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$PngBytes = $PngStream.ToArray()

foreach ($TargetIco in @($IconPath, $FaviconPath)) {
    $Fs = [System.IO.File]::Create($TargetIco)
    $Bw = New-Object System.IO.BinaryWriter($Fs)
    # ICONDIR header (Reserved=0, Type=1 for ICO, Count=1)
    $Bw.Write([UInt16]0)
    $Bw.Write([UInt16]1)
    $Bw.Write([UInt16]1)
    # ICONDIRENTRY (0=256px width, 0=256px height, 0 colors, 0 reserved, 1 plane, 32 bpp, size, offset=22)
    $Bw.Write([Byte]0)
    $Bw.Write([Byte]0)
    $Bw.Write([Byte]0)
    $Bw.Write([Byte]0)
    $Bw.Write([UInt16]1)
    $Bw.Write([UInt16]32)
    $Bw.Write([UInt32]$PngBytes.Length)
    $Bw.Write([UInt32]22)
    $Bw.Write($PngBytes)
    $Bw.Flush()
    $Fs.Close()
}

$G.Dispose()
$Bmp.Dispose()

# Create Windows Desktop Shortcut & Start Menu Shortcut
$WshShell = New-Object -ComObject WScript.Shell
$VbsLauncher = Join-Path $ProjectRoot "Launch Comic Vault.vbs"

$ShortcutLocations = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) "Comic Vault Box Manager.lnk"),
    (Join-Path ([Environment]::GetFolderPath('Programs')) "Comic Vault Box Manager.lnk")
)

foreach ($ShortcutPath in $ShortcutLocations) {
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
    $Shortcut.Arguments = "`"$VbsLauncher`""
    $Shortcut.WorkingDirectory = $ProjectRoot
    $Shortcut.IconLocation = "$IconPath,0"
    $Shortcut.Description = "Launch Comic Vault Box Manager"
    $Shortcut.WindowStyle = 1
    $Shortcut.Save()
    Write-Output "Created shortcut: $ShortcutPath"
}
