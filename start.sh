#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "[错误] 未检测到 docker，请先安装 Docker Desktop 或 Docker Engine。"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[错误] 未检测到 docker compose 插件，请升级 Docker。"
  exit 1
fi

if [ ! -f "./ShortDramaCat" ]; then
  echo "[提示] 当前目录缺少 ShortDramaCat 可执行文件（Linux amd64/arm64 二进制）。"
  echo "请从上游项目下载对应架构的 ShortDramaCat 放到项目根目录："
  echo "  https://github.com/kiroswu/hongguo-shortdramabox"
  echo "放置后重新运行 ./start.sh 即可一键启动。"
  exit 1
fi

chmod +x ./ShortDramaCat
mkdir -p ./data

echo "[1/2] 正在构建并启动服务..."
docker compose up -d --build

LAN_IP=""
if command -v ipconfig >/dev/null 2>&1; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
elif command -v hostname >/dev/null 2>&1; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi

echo "[2/2] 启动完成！"
echo "  本机访问: http://127.0.0.1:9588"
if [ -n "$LAN_IP" ]; then
  echo "  手机/局域网访问: http://${LAN_IP}:9588"
fi
echo "提示: 在 iPhone Safari 中打开后点击「分享 -> 添加到主屏幕」，即可全屏 PWA 观看。"
