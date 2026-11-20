#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

UPSTREAM_VER="v0.9.0"
UPSTREAM_BASE="https://github.com/kiroswu/hongguo-shortdramabox/releases/download/${UPSTREAM_VER}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[错误] 未检测到 docker，请先安装 Docker Desktop 或 Docker Engine。"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[错误] 未检测到 docker compose 插件，请升级 Docker。"
  exit 1
fi

if [ ! -f "./ShortDramaCat" ]; then
  ARCH="$(docker info --format '{{.Architecture}}' 2>/dev/null || uname -m)"
  case "$ARCH" in
    aarch64|arm64)
      ASSET="ShortDramaCat-${UPSTREAM_VER}-aarch64-linux"
      ;;
    x86_64|amd64)
      ASSET="ShortDramaCat-${UPSTREAM_VER}-x86_64-linux"
      ;;
    *)
      echo "[错误] 不支持的架构: $ARCH（仅支持 x86_64 / aarch64）。"
      exit 1
      ;;
  esac

  URL="${UPSTREAM_BASE}/${ASSET}"
  echo "[0/2] 未检测到 ./ShortDramaCat，正在为架构 ($ARCH) 自动下载上游二进制..."
  echo "      来源: $URL"
  if ! command -v curl >/dev/null 2>&1; then
    echo "[错误] 未安装 curl，请手动下载后保存为 ./ShortDramaCat：$URL"
    exit 1
  fi
  if ! curl -fSL --retry 2 --connect-timeout 15 -o ./ShortDramaCat.tmp "$URL"; then
    rm -f ./ShortDramaCat.tmp
    echo "[错误] 下载失败（如国内网络访问 GitHub 受限，可配置代理后重试，或手动下载放到 ./ShortDramaCat）："
    echo "       $URL"
    exit 1
  fi
  mv ./ShortDramaCat.tmp ./ShortDramaCat
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
