# 一键构建简普 PDA APK(D盘已装 Android SDK/JDK/Gradle 的机器)
# 用法: powershell -ExecutionPolicy Bypass -File build.ps1 [debug|release]
param([string]$mode = "release")

$SDK    = "D:\Android\Sdk"
$JDK    = "D:\Android\jdk17"
$GRADLE = "D:\Android\gradle-8.2\gradle-8.2\bin\gradle.bat"
$GH     = "D:\Android\gradle"

if (-not (Test-Path $GRADLE)) { Write-Error "找不到 Gradle: $GRADLE"; exit 1 }
$env:JAVA_HOME = $JDK
$env:ANDROID_HOME = $SDK
$env:ANDROID_SDK_ROOT = $SDK
$env:GRADLE_USER_HOME = $GH
$env:Path = "$JDK\bin;$SDK\platform-tools;$env:Path"

# 确保 local.properties 指向 SDK
"sdk.dir=$($SDK -replace '\\','\\')" | Out-File -Encoding ascii (Join-Path $PSScriptRoot "local.properties")

Push-Location $PSScriptRoot
try {
    & $GRADLE "assemble$($mode.Substring(0,1).ToUpper()+$mode.Substring(1))" --no-daemon
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $apk = Join-Path $PSScriptRoot "app\build\outputs\apk\$mode\app-$mode.apk"
    if (Test-Path $apk) {
        Write-Host "`nAPK 产物: $apk" -ForegroundColor Green
        $dist = Join-Path $PSScriptRoot "..\output\apk"
        New-Item -ItemType Directory -Force -Path $dist | Out-Null
        Copy-Item $apk (Join-Path $dist "JianyuPDA-v1.0-$mode.apk") -Force
        Write-Host "已复制到: $dist\JianyuPDA-v1.0-$mode.apk" -ForegroundColor Green
    }
} finally { Pop-Location }