param(
  [string]$AdbPath,
  [string]$DeviceSerial,
  [string]$ApkPath,
  [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $mobileRoot '../..'))
if (-not $ApkPath) { $ApkPath = Join-Path $mobileRoot 'android/app/build/outputs/apk/release/app-release.apk' }
$ApkPath = (Resolve-Path -LiteralPath $ApkPath).Path
if (-not $AdbPath) {
  $adbCommand = Get-Command adb.exe -ErrorAction SilentlyContinue
  if ($adbCommand) { $AdbPath = $adbCommand.Source }
  elseif ($env:ANDROID_HOME -and (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'))) { $AdbPath = Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe' }
  else { $AdbPath = Join-Path $repositoryRoot '.local/android-tools/sdk/platform-tools/adb.exe' }
}
$AdbPath = (Resolve-Path -LiteralPath $AdbPath).Path
$devices = @(& $AdbPath devices)
if ($LASTEXITCODE -ne 0) { throw 'adb device inspection failed.' }
$ready = @($devices | ForEach-Object { if ($_ -match '^([^\s]+)\s+device$') { $Matches[1] } })
if ($DeviceSerial) {
  if ($ready -notcontains $DeviceSerial) { throw 'Requested Android device is not connected and authorized. Unlock it and allow USB debugging.' }
} elseif ($ready.Count -eq 1) { $DeviceSerial = $ready[0] }
else { throw 'Connect exactly one authorized Fold, or pass -DeviceSerial. No install or app-data change was attempted.' }
$sdkDirectory = Split-Path -Parent (Split-Path -Parent $AdbPath)
$aaptCandidates = @(Get-ChildItem -LiteralPath (Join-Path $sdkDirectory 'build-tools') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'aapt.exe' } | Where-Object { Test-Path -LiteralPath $_ })
if ($aaptCandidates.Count -eq 0) { throw 'Android SDK aapt is required to verify APK package identity before installation.' }
$badging = @(& $aaptCandidates[0] dump badging $ApkPath)
if ($LASTEXITCODE -ne 0 -or -not ($badging | Where-Object { $_ -match "^package: name='tech.adwen.psyrec.capture' " })) { throw 'The supplied APK is not the expected PsyRec capture package. Installation was not attempted.' }
$builtDigest = (Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not $VerifyOnly) {
  & $AdbPath -s $DeviceSerial install -r $ApkPath
  if ($LASTEXITCODE -ne 0) { throw 'APK replacement failed. Do not uninstall or clear app data; retain encrypted pending items.' }
}
$package = 'tech.adwen.psyrec.capture'
$packagePaths = @(& $AdbPath -s $DeviceSerial shell pm path $package)
if ($LASTEXITCODE -ne 0) { throw 'Could not read installed package identity.' }
$base = @($packagePaths | Where-Object { $_ -match '^package:/data/app/.+/base\.apk$' })
if ($base.Count -ne 1) { throw 'Expected exactly one installed base APK path; cannot verify this installation.' }
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$evidenceDirectory = Join-Path $repositoryRoot ('.local/mobile-install/' + $stamp)
New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null
$installedCopy = Join-Path $evidenceDirectory 'installed-base.apk'
& $AdbPath -s $DeviceSerial pull $base[0].Substring(8) $installedCopy
if ($LASTEXITCODE -ne 0) { throw 'Could not hash the installed APK. Installation identity remains unverified.' }
$installedDigest = (Get-FileHash -LiteralPath $installedCopy -Algorithm SHA256).Hash.ToLowerInvariant()
if ($installedDigest -ne $builtDigest) { throw 'Installed APK hash differs from the supplied build. Do not label it verified.' }
$model = ((& $AdbPath -s $DeviceSerial shell getprop ro.product.model) -join '').Trim()
$packageInfo = @(& $AdbPath -s $DeviceSerial shell dumpsys package $package | Select-String 'versionCode=|versionName=|firstInstallTime=|lastUpdateTime=') | ForEach-Object { $_.Line.Trim() }
$evidence = [ordered]@{
  schemaVersion = 1; kind = 'android-install-identity'; observedAt = [DateTime]::UtcNow.ToString('o')
  packageName = $package; deviceModel = $model; apkSha256 = $builtDigest; installedApkSha256 = $installedDigest
  installedHashMatchesBuild = $true; replacementInstallPerformed = -not [bool]$VerifyOnly
  method = 'adb install -r followed by pm path, adb pull of installed base APK and host SHA-256 comparison; no uninstall or data clear'
  packageVersionObservations = $packageInfo; physicalWorkflowAccepted = $false
}
$evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'identity.json') -Encoding utf8
$evidence | ConvertTo-Json -Depth 5
Write-Output ('Identity evidence retained at ' + (Join-Path $evidenceDirectory 'identity.json'))
