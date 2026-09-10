#requires -Version 5.1
<#
.SYNOPSIS
Record synthetic PsyRec desktop scenes. Keep the window visible and unobscured.
.DESCRIPTION
Region is x,y,w,h in physical desktop pixels, overriding window discovery.
WhatIf prints a plan only; window/screen discovery is deferred to the real run.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][ValidateSet('S4','S5','S6')][string]$Scene,
    [ValidateRange(1,86400)][int]$Seconds = 60,
    [string]$Region
)
$ErrorActionPreference = 'Stop'
$Scene = $Scene.ToUpperInvariant()
$projectRoot = Split-Path -Parent $PSScriptRoot
$captureDir = Join-Path $projectRoot 'captures'
$output = Join-Path $captureDir ('desktop-{0}-{1}.mp4' -f $Scene, (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$inputArgs = @('-f','gdigrab','-framerate','30','-draw_mouse','1')
if ($Region) {
    if ($Region -notmatch '^\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$') { throw 'Region must be x,y,w,h in physical pixels.' }
    $x = [int]$Matches[1]; $y = [int]$Matches[2]; $w = [int]$Matches[3]; $h = [int]$Matches[4]
    if ($w -lt 1 -or $h -lt 1) { throw 'Region width and height must be positive.' }
    $inputArgs += @('-offset_x',"$x",'-offset_y',"$y",'-video_size',"${w}x${h}",'-i','desktop')
} elseif ($WhatIfPreference) {
    Write-Host 'WhatIf: real run discovers the exact visible PsyRec window; otherwise uses primary-screen bounds. Command below illustrates a 1920x1080 primary screen.'
    $inputArgs += @('-offset_x','0','-offset_y','0','-video_size','1920x1080','-i','desktop')
} else {
    # Add-Type compilation must keep its temporary files inside the project.
    $tempDir = Join-Path $projectRoot '.cache/capture-temp'
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
    $savedTemp = $env:TEMP; $savedTmp = $env:TMP
    try {
        $env:TEMP = $tempDir; $env:TMP = $tempDir
        if (-not ('PsyRecCapture.Native' -as [type])) {
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace PsyRecCapture {
    public static class Native {
        [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
        [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
        [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    }
}
'@
        }
        $oldDpi = [PsyRecCapture.Native]::SetThreadDpiAwarenessContext([IntPtr](-4))
        try {
            $window = [PsyRecCapture.Native]::FindWindow($null, 'PsyRec')
            if ($window -ne [IntPtr]::Zero -and [PsyRecCapture.Native]::IsWindowVisible($window)) {
                if ([PsyRecCapture.Native]::IsIconic($window)) { throw 'Restore the minimized PsyRec window before recording.' }
                Write-Host 'Recording window titled PsyRec. Keep it visible and unobscured.'
                $inputArgs += @('-i','title=PsyRec')
            } else {
                $w = [PsyRecCapture.Native]::GetSystemMetrics(0); $h = [PsyRecCapture.Native]::GetSystemMetrics(1)
                if ($w -lt 1 -or $h -lt 1) { throw 'Could not determine primary-screen bounds.' }
                Write-Warning 'PsyRec window not found; recording primary screen. Clear all unrelated/private content.'
                $inputArgs += @('-offset_x','0','-offset_y','0','-video_size',"${w}x${h}",'-i','desktop')
            }
        } finally { if ($oldDpi -ne [IntPtr]::Zero) { [void][PsyRecCapture.Native]::SetThreadDpiAwarenessContext($oldDpi) } }
    } finally { $env:TEMP = $savedTemp; $env:TMP = $savedTmp }
}
$ffmpegArgs = @('-hide_banner','-n') + $inputArgs + @('-t',"$Seconds",'-an','-vf','scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1','-r','30','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',$output)
Write-Host ('& ffmpeg ' + (($ffmpegArgs | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }) -join ' '))
Write-Host "Output: $output"
if ($WhatIfPreference) { Write-Host 'WhatIf: no discovery, recording or file writes performed.'; return }
if ($PSCmdlet.ShouldProcess($output, "Record $Seconds seconds of synthetic desktop video (no audio)")) {
    Get-Command ffmpeg -CommandType Application -ErrorAction Stop | Out-Null
    New-Item -ItemType Directory -Force -Path $captureDir | Out-Null
    & ffmpeg @ffmpegArgs
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed ($LASTEXITCODE). Inspect the partial local output before retrying." }
    if (-not (Test-Path -LiteralPath $output) -or (Get-Item -LiteralPath $output).Length -eq 0) { throw 'ffmpeg produced no usable file.' }
    Write-Host "Saved: $output"
}
