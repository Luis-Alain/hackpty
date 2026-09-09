$ErrorActionPreference = 'Stop'
# Execute the production control flow in a temporary tree, replacing only the two
# external executable call sites. No real adb/aapt process or Android device is used.
$source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'install-verified-android.ps1'))
if (-not $source.Contains('& $AdbPath') -or -not $source.Contains('& $aaptCandidates[0]')) { throw 'Installer executable call sites changed; review this test harness.' }
$instrumented = $source.Replace('& $AdbPath', 'Invoke-PsyRecTestAdb').Replace('& $aaptCandidates[0]', 'Invoke-PsyRecTestAapt')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('psyrec-installer-test-' + [Guid]::NewGuid().ToString('N'))
$scriptDirectory = Join-Path $testRoot 'apps/mobile/scripts'
$sdkRoot = Join-Path $testRoot 'sdk'
New-Item -ItemType Directory -Path $scriptDirectory, (Join-Path $sdkRoot 'platform-tools'), (Join-Path $sdkRoot 'build-tools/mock') | Out-Null
$scriptPath = Join-Path $scriptDirectory 'install-verified-android.ps1'
[IO.File]::WriteAllText($scriptPath, $instrumented)
$adbPath = Join-Path $sdkRoot 'platform-tools/adb.mock'
[IO.File]::WriteAllText($adbPath, 'mock placeholder; never executable')
[IO.File]::WriteAllText((Join-Path $sdkRoot 'build-tools/mock/aapt.exe'), 'mock placeholder; never executable')
$apkPath = Join-Path $testRoot 'synthetic.apk'
$builtBytes = [Text.Encoding]::UTF8.GetBytes('synthetic intended APK bytes')
[IO.File]::WriteAllBytes($apkPath, $builtBytes)
$oldBytes = [Text.Encoding]::UTF8.GetBytes('synthetic prior APK bytes')
function Assert-Installer($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function global:Invoke-PsyRecTestAapt {
  $global:LASTEXITCODE = 0
  "package: name='tech.adwen.psyrec.capture' versionCode='1' versionName='synthetic-test'"
}
function global:Invoke-PsyRecTestAdb {
  $global:LASTEXITCODE = 0
  $command = $args -join ' '
  $global:PsyRecInstallerTestState.Commands.Add($command)
  if ($args.Count -eq 1 -and $args[0] -eq 'devices') { "List of devices attached"; "synthetic-device`tdevice"; return }
  Assert-Installer ($args[0] -eq '-s' -and $args[1] -eq 'synthetic-device') 'ADB command did not target the synthetic device.'
  if ($args[2] -eq 'shell' -and $args[3] -eq 'getprop') {
    if ($args[4] -eq 'ro.product.model') { 'SYNTHETIC-ANDROID-TEST'; return }
    if ($args[4] -eq 'ro.product.manufacturer') { 'synthetic manufacturer'; return }
  }
  if ($args[2] -eq 'shell' -and $args[3] -eq 'pm' -and $args[4] -eq 'path') {
    if ($null -ne $global:PsyRecInstallerTestState.InstalledBytes) { 'package:/data/app/synthetic/base.apk' } else { ''; ' ' }
    return
  }
  if ($args[2] -eq 'pull') {
    Assert-Installer ($null -ne $global:PsyRecInstallerTestState.InstalledBytes) 'Cannot pull an absent mock APK.'
    [IO.File]::WriteAllBytes($args[4], $global:PsyRecInstallerTestState.InstalledBytes)
    return
  }
  if ($args[2] -eq 'install') {
    Assert-Installer ($args[3] -eq '-r') 'Installer attempted a non-preserving install.'
    $global:PsyRecInstallerTestState.InstallCalls++
    $global:PsyRecInstallerTestState.InstalledBytes = [IO.File]::ReadAllBytes($args[4])
    return
  }
  if ($args[2] -eq 'shell' -and $args[3] -eq 'dumpsys' -and $args[4] -eq 'package') { 'versionCode=1'; 'versionName=synthetic-test'; return }
  throw ('Unexpected mock ADB operation: ' + $command)
}
$caseResults = [Collections.Generic.List[object]]::new()
try {
  foreach ($case in @(
    @{ Name = 'matching-default-skips-install'; Bytes = $builtBytes; VerifyOnly = $false; InstallCalls = 0; Matches = $true },
    @{ Name = 'matching-verify-only'; Bytes = $builtBytes; VerifyOnly = $true; InstallCalls = 0; Matches = $true },
    @{ Name = 'mismatch-verify-only-retains-identity'; Bytes = $oldBytes; VerifyOnly = $true; InstallCalls = 0; Matches = $false },
    @{ Name = 'mismatch-updates-after-inspection'; Bytes = $oldBytes; VerifyOnly = $false; InstallCalls = 1; Matches = $true },
    @{ Name = 'absent-verify-only-retains-identity'; Bytes = $null; VerifyOnly = $true; InstallCalls = 0; Matches = $false },
    @{ Name = 'absent-installs-once'; Bytes = $null; VerifyOnly = $false; InstallCalls = 1; Matches = $true }
  )) {
    $global:PsyRecInstallerTestState = @{ InstalledBytes = $case.Bytes; InstallCalls = 0; Commands = [Collections.Generic.List[string]]::new() }
    $prior = @(Get-ChildItem -LiteralPath (Join-Path $testRoot '.local/mobile-install') -Filter identity.json -Recurse -ErrorAction SilentlyContinue | ForEach-Object FullName)
    $failure = $null
    try { & $scriptPath -AdbPath $adbPath -ApkPath $apkPath -VerifyOnly:$case.VerifyOnly | Out-Null } catch { $failure = $_.Exception.Message }
    $new = @(Get-ChildItem -LiteralPath (Join-Path $testRoot '.local/mobile-install') -Filter identity.json -Recurse | Where-Object { $_.FullName -notin $prior })
    Assert-Installer ($new.Count -eq 1) ($case.Name + ': one new no-clobber identity record required.')
    $identity = [IO.File]::ReadAllText($new[0].FullName) | ConvertFrom-Json
    Assert-Installer ($global:PsyRecInstallerTestState.InstallCalls -eq $case.InstallCalls) ($case.Name + ': incorrect install count.')
    Assert-Installer ($identity.installedHashMatchesBuild -eq $case.Matches) ($case.Name + ': match evidence incorrect.')
    Assert-Installer ($identity.replacementInstallPerformed -eq ($case.InstallCalls -eq 1)) ($case.Name + ': install attribution incorrect.')
    Assert-Installer ($identity.deviceModel -eq 'SYNTHETIC-ANDROID-TEST' -and $identity.deviceManufacturer -eq 'synthetic manufacturer') ($case.Name + ': actual mock identity was not retained.')
    Assert-Installer ($identity.physicalWorkflowAccepted -eq $false) ($case.Name + ': synthetic harness cannot accept physical work.')
    Assert-Installer (($null -eq $failure) -eq $case.Matches) ($case.Name + ': mismatch must fail after retaining evidence.')
    if ($case.InstallCalls -eq 0) { Assert-Installer ($identity.method.StartsWith('Read-only ')) ($case.Name + ': read-only method misattributed installation.') }
    if ($case.Name -eq 'matching-default-skips-install') { Assert-Installer $identity.matchingInstallSkipped 'Matching default install was not explicitly skipped.' }
    if ($null -ne $case.Bytes) {
      Assert-Installer ($identity.beforeInstalledApkSha256 -eq ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($case.Bytes))).ToLowerInvariant()) ($case.Name + ': prior measured hash missing.')
    } else { Assert-Installer ($null -eq $identity.beforeInstalledApkSha256) ($case.Name + ': absent installation must remain absent.') }
    if ($case.InstallCalls -eq 1) {
      $calls = $global:PsyRecInstallerTestState.Commands
      $installIndex = $calls.FindIndex([Predicate[string]]{ param($line) $line.Contains(' install ') })
      $inspectIndex = $calls.FindIndex([Predicate[string]]{ param($line) $line.Contains(' shell pm path ') })
      Assert-Installer ($inspectIndex -ge 0 -and $inspectIndex -lt $installIndex) ($case.Name + ': installed package must be inspected before install.')
    }
    $caseResults.Add(@{ name = $case.Name; status = 'passed' })
  }
  Assert-Installer ((@(Get-ChildItem -LiteralPath (Join-Path $testRoot '.local/mobile-install') -Filter identity.json -Recurse)).Count -eq $caseResults.Count) 'An identity record was overwritten.'
  [ordered]@{ status = 'passed'; scope = 'Mocked installer control flow; no actual device or APK installation'; cases = $caseResults; temporaryEvidenceDirectory = $testRoot } | ConvertTo-Json -Depth 5
} finally {
  Remove-Item -LiteralPath Function:\Invoke-PsyRecTestAdb, Function:\Invoke-PsyRecTestAapt
  Remove-Variable -Name PsyRecInstallerTestState -Scope Global -ErrorAction SilentlyContinue
}
