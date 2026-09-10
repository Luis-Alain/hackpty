param([ValidateSet('Debug', 'Release')][string]$Variant = 'Release', [ValidateRange(2048, 8192)][int]$GradleHeapMb = 4096)
$ErrorActionPreference = 'Stop'
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) { throw 'Set JAVA_HOME to your JDK 17 installation.' }
if (-not $env:ANDROID_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'))) { throw 'Set ANDROID_HOME to your provisioned Android SDK.' }
$mobileRoot = Split-Path -Parent $PSScriptRoot
Push-Location $mobileRoot
try {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'Mobile dependency installation failed.' }
  & npm.cmd run check
  if ($LASTEXITCODE -ne 0) { throw 'Mobile TypeScript validation failed.' }
  & npm.cmd run prebuild
  if ($LASTEXITCODE -ne 0) { throw 'Expo native generation failed.' }
  Push-Location (Join-Path $mobileRoot 'android')
  try {
    & ./gradlew.bat "app:assemble$Variant" '-PreactNativeArchitectures=arm64-v8a' '--console=plain' '--max-workers=2' "-Dorg.gradle.jvmargs=-Xmx$($GradleHeapMb)m -XX:MaxMetaspaceSize=768m"
    if ($LASTEXITCODE -ne 0) { throw 'Native APK build failed.' }
    $apkPath = Join-Path $mobileRoot "android/app/build/outputs/apk/$($Variant.ToLowerInvariant())/app-$($Variant.ToLowerInvariant()).apk"
    Get-Item -LiteralPath $apkPath | Select-Object FullName, Length
    Get-FileHash -LiteralPath $apkPath -Algorithm SHA256
  } finally { Pop-Location }
} finally { Pop-Location }
