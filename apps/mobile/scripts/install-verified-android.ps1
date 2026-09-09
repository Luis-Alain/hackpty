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
else { throw 'Connect exactly one authorized Android device, or pass -DeviceSerial. No install or app-data change was attempted.' }
$sdkDirectory = Split-Path -Parent (Split-Path -Parent $AdbPath)
$aaptCandidates = @(Get-ChildItem -LiteralPath (Join-Path $sdkDirectory 'build-tools') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'aapt.exe' } | Where-Object { Test-Path -LiteralPath $_ })
if ($aaptCandidates.Count -eq 0) { throw 'Android SDK aapt is required to verify APK package identity before installation.' }
$badging = @(& $aaptCandidates[0] dump badging $ApkPath)
if ($LASTEXITCODE -ne 0 -or -not ($badging | Where-Object { $_ -match "^package: name='tech.adwen.psyrec.capture' " })) { throw 'The supplied APK is not the expected PsyRec capture package. Installation was not attempted.' }
$builtDigest = (Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant()
$package = 'tech.adwen.psyrec.capture'
$model = ((& $AdbPath -s $DeviceSerial shell getprop ro.product.model) -join '').Trim()
if ($LASTEXITCODE -ne 0 -or -not $model) { throw 'Could not read the connected Android device model. No install was attempted.' }
$manufacturer = ((& $AdbPath -s $DeviceSerial shell getprop ro.product.manufacturer) -join '').Trim()
if ($LASTEXITCODE -ne 0 -or -not $manufacturer) { throw 'Could not read the connected Android manufacturer. No install was attempted.' }
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$evidenceDirectory = Join-Path $repositoryRoot ('.local/mobile-install/' + $stamp + '-' + [Guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $evidenceDirectory) { throw 'Identity evidence path already exists. Refusing to overwrite it.' }
New-Item -ItemType Directory -Path $evidenceDirectory | Out-Null
function Read-InstalledDigest([string]$CopyName) {
  $packagePaths = @(& $AdbPath -s $DeviceSerial shell pm path $package | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($LASTEXITCODE -ne 0) { throw 'Could not read installed package identity.' }
  $base = @($packagePaths | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^package:/data/app/.+/base\.apk$' })
  if ($packagePaths.Count -eq 0) { return $null }
  if ($base.Count -ne 1) { throw 'Expected exactly one installed base APK path; cannot verify this installation.' }
  $installedCopy = Join-Path $evidenceDirectory $CopyName
  if (Test-Path -LiteralPath $installedCopy) { throw 'Installed APK evidence already exists. Refusing to overwrite it.' }
  & $AdbPath -s $DeviceSerial pull $base[0].Substring(8) $installedCopy | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Could not hash the installed APK. No replacement should proceed without identity inspection.' }
  return (Get-FileHash -LiteralPath $installedCopy -Algorithm SHA256).Hash.ToLowerInvariant()
}
$beforeDigest = Read-InstalledDigest 'before-base.apk'
$installedDigest = $beforeDigest
$installPerformed = $false
if (-not $VerifyOnly -and $beforeDigest -ne $builtDigest) {
  & $AdbPath -s $DeviceSerial install -r $ApkPath | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'APK replacement failed. Do not uninstall or clear app data; retain encrypted pending items.' }
  $installPerformed = $true
  $installedDigest = Read-InstalledDigest 'installed-base.apk'
}
$matches = $null -ne $installedDigest -and $installedDigest -eq $builtDigest
$packageInfo = @(& $AdbPath -s $DeviceSerial shell dumpsys package $package | Select-String 'versionCode=|versionName=|firstInstallTime=|lastUpdateTime=') | ForEach-Object { $_.Line.Trim() }
if ($LASTEXITCODE -ne 0) { throw 'Could not read Android package version observations.' }
$method = if ($installPerformed) { 'Read installed identity first; adb install -r for absent/different APK, then pm path, adb pull and host SHA-256 comparison; no uninstall or data clear' }
  else { 'Read-only pm path, adb pull and host SHA-256 comparison; no install, uninstall or data clear' }
$evidence = [ordered]@{
  schemaVersion = 1; kind = 'android-install-identity'; observedAt = [DateTime]::UtcNow.ToString('o')
  packageName = $package; deviceManufacturer = $manufacturer; deviceModel = $model
  apkSha256 = $builtDigest; beforeInstalledApkSha256 = $beforeDigest; installedApkSha256 = $installedDigest
  installedHashMatchesBuild = $matches; replacementInstallPerformed = $installPerformed
  matchingInstallSkipped = -not [bool]$VerifyOnly -and -not $installPerformed -and $matches
  verificationOnly = [bool]$VerifyOnly; method = $method
  packageVersionObservations = $packageInfo; physicalWorkflowAccepted = $false
}
$identityPath = Join-Path $evidenceDirectory 'identity.json'
$identityJson = $evidence | ConvertTo-Json -Depth 5
$identityBytes = [Text.UTF8Encoding]::new($false).GetBytes($identityJson + [Environment]::NewLine)
$identityStream = [IO.File]::Open($identityPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try { $identityStream.Write($identityBytes, 0, $identityBytes.Length) } finally { $identityStream.Dispose() }
Write-Output $identityJson
Write-Output ('Identity evidence retained at ' + $identityPath)
if (-not $matches) { throw 'Installed APK is absent or differs from the supplied build. The measured identity was retained; no verified installation is claimed.' }
