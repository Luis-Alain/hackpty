#requires -Version 5.1
<#
.SYNOPSIS
Record the synthetic S3 phone workflow. WhatIf never contacts a device.
.DESCRIPTION
ADB resolution: -AdbPath, adb on PATH, then Jeff's supplied local SDK path.
Device copy is deleted only after successful pull of a nonempty local file.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][ValidateSet('S3')][string]$Scene,
    [ValidateRange(1,180)][int]$Seconds = 90,
    [string]$AdbPath
)
$ErrorActionPreference = 'Stop'
$Scene = $Scene.ToUpperInvariant()
$projectRoot = Split-Path -Parent $PSScriptRoot
$captureDir = Join-Path $projectRoot 'captures'
$output = Join-Path $captureDir ('phone-{0}-{1}.mp4' -f $Scene, (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$deviceFile = "/sdcard/psyrec-$Scene.mp4"
if (-not $AdbPath) {
    $adbCommand = Get-Command adb -CommandType Application -ErrorAction SilentlyContinue
    if ($adbCommand) { $AdbPath = $adbCommand.Source }
    else { $AdbPath = 'C:/Users/jeffe/Code/hackpty/.local/android-tools/sdk/platform-tools/adb.exe' }
}
function Show-AdbCommand([string[]]$Arguments) {
    Write-Host ("& '" + $AdbPath.Replace("'", "''") + "' " + (($Arguments | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }) -join ' '))
}
if ($WhatIfPreference) {
    Write-Host 'WhatIf: require exactly one authorized adb device; print its ro.product.model; refuse an existing device copy.'
    Show-AdbCommand @('-s','<selected-device>','shell','getprop','ro.product.model')
    Show-AdbCommand @('-s','<selected-device>','shell','screenrecord','--size','1080x2340','--bit-rate','8000000','--time-limit',"$Seconds",$deviceFile)
    Show-AdbCommand @('-s','<selected-device>','pull',$deviceFile,$output)
    Show-AdbCommand @('-s','<selected-device>','shell','rm',$deviceFile)
    Write-Host "Output: $output"
    Write-Host 'WhatIf: no adb execution, recording, pull, deletion or file writes performed.'
    return
}
if (-not $PSCmdlet.ShouldProcess($output, "Record $Seconds seconds of synthetic phone video, pull it, then remove only its device copy")) { return }
if (-not (Test-Path -LiteralPath $AdbPath -PathType Leaf)) { throw 'adb not found. Supply -AdbPath or put adb on PATH.' }
$listing = @(& $AdbPath devices)
if ($LASTEXITCODE -ne 0) { throw 'adb devices failed.' }
$devices = @($listing | Where-Object { $_ -match '^\S+\s+(device|offline|unauthorized|recovery|sideload|no permissions)\b' })
if ($devices.Count -ne 1 -or $devices[0] -notmatch '^(\S+)\s+device\s*$') { throw 'Connect and authorize exactly one Android device; no recording started.' }
$serial = $Matches[1]
$model = @(& $AdbPath -s $serial shell getprop ro.product.model)
if ($LASTEXITCODE -ne 0 -or -not ($model -join '').Trim()) { throw 'Could not identify device model.' }
Write-Host ('Device model: ' + ($model -join '').Trim())
# Never overwrite an unpulled recording from a previous attempt.
$existing = @(& $AdbPath -s $serial shell "if [ -e $deviceFile ]; then echo exists; else echo absent; fi")
if ($LASTEXITCODE -ne 0 -or ($existing -join '').Trim() -ne 'absent') { throw "Device copy already exists or could not be checked: $deviceFile. Recover it manually before retrying." }
if (Test-Path -LiteralPath $output) { throw "Output already exists: $output" }
New-Item -ItemType Directory -Force -Path $captureDir | Out-Null
$recordArgs = @('-s',$serial,'shell','screenrecord','--size','1080x2340','--bit-rate','8000000','--time-limit',"$Seconds",$deviceFile)
Write-Host "Output: $output"
Show-AdbCommand $recordArgs
& $AdbPath @recordArgs
if ($LASTEXITCODE -ne 0) { throw "screenrecord failed ($LASTEXITCODE). Any device copy was preserved: $deviceFile" }
$pullArgs = @('-s',$serial,'pull',$deviceFile,$output)
Show-AdbCommand $pullArgs
& $AdbPath @pullArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output) -or (Get-Item -LiteralPath $output).Length -eq 0) { throw "Pull failed or was empty. Device copy preserved: $deviceFile" }
$removeArgs = @('-s',$serial,'shell','rm',$deviceFile)
Show-AdbCommand $removeArgs
& $AdbPath @removeArgs
if ($LASTEXITCODE -ne 0) { throw "Local recording saved, but device cleanup failed: $deviceFile" }
Write-Host "Saved: $output"
Write-Host 'Raw phone size is 1080x2340, not 9:16. Follow captures/README.md to prepare the slot clip.'
