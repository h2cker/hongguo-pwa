@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo   红果短剧 Web / PWA 一键本地部署 (Windows)
echo ==========================================
echo.

where docker >nul 2>nul
if %errorlevel% neq 0 (
  echo [错误] 未检测到 Docker，请先安装并启动 Docker Desktop。
  pause
  exit /b 1
)

docker info >nul 2>nul
if %errorlevel% neq 0 (
  echo [错误] Docker Desktop 未运行，请先打开 Docker Desktop 后再双击本脚本。
  pause
  exit /b 1
)

if not exist "ShortDramaCat" (
  echo [1/3] 正在自动下载必要组件 ShortDramaCat...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$urls = @('https://github.com/kiroswu/hongguo-shortdramabox/releases/download/v0.9.0/ShortDramaCat-v0.9.0-x86_64-linux','https://ghfast.top/https://github.com/kiroswu/hongguo-shortdramabox/releases/download/v0.9.0/ShortDramaCat-v0.9.0-x86_64-linux','https://gh-proxy.com/https://github.com/kiroswu/hongguo-shortdramabox/releases/download/v0.9.0/ShortDramaCat-v0.9.0-x86_64-linux');" ^
    "$ok = $false;" ^
    "foreach ($u in $urls) { try { Write-Host ('      尝试: ' + $u); Invoke-WebRequest -Uri $u -OutFile 'ShortDramaCat.tmp' -TimeoutSec 45 -UseBasicParsing; if ((Get-Item 'ShortDramaCat.tmp').Length -gt 0) { Move-Item -Force 'ShortDramaCat.tmp' 'ShortDramaCat'; $ok = $true; break } } catch {} }" ^
    "if (-not $ok) { if (Test-Path 'ShortDramaCat.tmp') { Remove-Item -Force 'ShortDramaCat.tmp' }; exit 1 }"
  if %errorlevel% neq 0 (
    echo [错误] 自动下载 ShortDramaCat 失败，请检查网络或代理后重试。
    pause
    exit /b 1
  )
)

if not exist "data" mkdir data

echo [2/3] 正在构建并启动服务（首次启动约 1~2 分钟）...
docker compose up -d --build
if %errorlevel% neq 0 (
  echo [错误] Docker 启动失败，请检查端口 9587 / 9588 是否被占用。
  pause
  exit /b 1
)

echo [3/3] 启动成功！
echo.
echo   电脑本机访问: http://127.0.0.1:9588
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Docker' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty IPAddress)"') do (
  if not "%%i"=="" echo   iPhone / 局域网访问: http://%%i:9588
)
echo.
echo 提示: 用 iPhone Safari 打开上方局域网地址 -^> 分享 -^> 添加到主屏幕，即可全屏观看！
start "" "http://127.0.0.1:9588"
pause
