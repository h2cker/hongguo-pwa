# 红果短剧 Web / PWA (`hongguo-pwa`)

支持 **iOS / Android / Windows / macOS 全平台浏览器与 PWA** 的**红果短剧**局域网自建竖屏播放器（无广告、免登录、支持 Docker 一键部署）。在家里电脑或 NAS 上启动后，手机、平板、电脑连同一 Wi-Fi 即可直接刷剧，并对 **iPhone Safari / AVPlayer** 做了深度兼容优化。

> **检索关键词**：红果短剧、红果短剧网页版、红果短剧 PWA、红果短剧 iOS / iPhone 版、红果短剧安卓版、红果短剧 NAS 自建、红果短剧 Docker 一键部署、无广告竖屏短剧播放器、`hongguo-shortdrama`、`hongguo pwa`、`short drama pwa`、`self-hosted short drama`、`http 206 range proxy`、`ffmpeg faststart decrypt`。

---

## ✨ 核心优势对比

| 痛点对比 | 常规自建 / 网页方案 | 本项目 (`hongguo-pwa`) |
| :--- | :--- | :--- |
| **多端兼容性** | 只适配单一平台，iPhone 经常加密流/`bytevc2` 黑屏 | **全平台通吃 + 深度适配 iOS**：iOS / Android / PC 浏览器开箱即看；服务端自动过滤 `bytevc2/h266`，`ffmpeg` 解密 + `+faststart` 重封装，原生支持 `HTTP 206` 任意拖拽 |
| **切集/切剧延迟** | 播完才开始请求下一集，转圈等待 5~10 秒 | **双级预热 + 内存直切**：起播 2 秒即在后台提前解密下一集并预载入内存，连播近乎零延迟无缝切换（超大文件自动回退服务端 `206` 流式秒播） |
| **通道稳定性** | 单一接口异常或限流即报错黑屏 | **双路主备自动容灾**：无锁并发 `V5` 签名主通道 + `ShortDramaCat` 自动备用兜底 + 前端 `502`/超时自动降级重试 |
| **接口响应速度** | 每次点剧、搜索都重新请求上游 | **全链路多级缓存**：详情/搜索/榜单/分类 5 分钟服务端缓存（NAS 局域网实测命中 **~30ms**），120 集本地媒体缓存回看秒出 |
| **刷剧体验** | 每次刷新推荐重复度高，交互生硬 | **原生 App 级竖屏交互**：随机推荐防重复、上下滑换剧/切集、长按 2x 倍速、锁屏防误触、手机安装 PWA 全屏播放 |

---

## 🚀 一分钟极简一键启动

唯一前提：电脑或 NAS 上已安装并启动 **Docker**（Mac / Windows 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)，群晖 / 飞牛 / 威联通 / Linux 安装 Docker Compose）。

### 方式 A：Mac / Linux / NAS（复制下面一整行，粘贴回车即可）

```bash
git clone https://github.com/h2cker/hongguo-pwa.git && cd hongguo-pwa && bash start.sh
```

> 脚本会自动完成：识别宿主机 CPU 架构（`x86_64` / `arm64` 均支持）-> 自动拉取上游运行组件（内置国内镜像兜底）-> 构建启动容器 -> 校验首页就绪 -> 输出手机/电脑访问地址。

### 方式 B：Windows 电脑（双击运行）

1. 点击页面右上角绿色按钮 **`Code` -> `Download ZIP`** 下载并解压（或使用 `git clone`）。
2. 确保 **Docker Desktop** 已启动运行。
3. **直接双击文件夹中的 `start.bat`**，等待片刻即可自动打开播放页。

### 各设备如何观看？
脚本运行完成后会在终端打印 **局域网地址**（例如 `http://192.168.1.100:9588`），确保设备处于同一 Wi-Fi：
- **iPhone / iPad**：用 **Safari** 打开局域网地址 -> 点底部分享按钮 -> **「添加到主屏幕」**，即可全屏 App 观看。
- **Android 手机 / 平板**：用 **Chrome / Edge / 自带浏览器** 打开局域网地址，可直接播放或安装为桌面 PWA 应用。
- **Windows / Mac 电脑**：浏览器直接访问 `http://127.0.0.1:9588` 即可观看，支持横竖屏自适应与键盘/滚轮操作。

---

## 功能特性详情

- **双路主备容灾（高可用不卡死）**：
  - **主通道 (`v5`)**：无锁并发 `V5Signer`（支持多接口节点切换与设备槽位失败热轮换）；
  - **备用通道 (`sdc-fallback`)**：主通道异常时无缝切换上游 `ShortDramaCat` 通道；
  - **前端自愈**：遇 `502` 或通道繁忙自动重试，高清缓冲超时自动切 `720p` 续播，遇 `bytevc2` 不兼容剧集自动跳过。
- **低延迟预加载架构**：
  - **播放 2 秒双预热**：后台提前为“下一集”和“下一部剧”拉取播放源并完成服务端下载解密；
  - **内存 Blob 预加载**：下一集提前下载进浏览器内存缓存，实现无缝连播；
  - **多级缓存**：详情/搜索/榜单/分类 5 分钟服务端缓存 + 120 集本地磁盘缓存，默认 `720p` 起播兼顾清晰度与速度（可随时切 `1080p`）。
- **iOS 原生级竖屏体验**：支持上下滑换剧/切集、长按 2x 快进、锁屏、倍速记忆、画面铺满/原始切换、选集抽屉、收藏与断点续播记忆、随机推荐流。

---

## 系统架构与上游来源

```text
iPhone Safari / PWA
        │  HTTP :9588
        ▼
┌───────────────────┐
│  ios-web (Nginx)  │  静态页面 (index.html / sw.js) + 反向代理
└─────────┬─────────┘
          ├── /api/ & /v5media/ ──▶ ┌────────────────────────────────────┐
          │                         │  v5-proxy (Node.js :9589)          │
          │                         │   ├─ V5Signer (Java :9590)         │
          │                         │   └─ ffmpeg 解密 +faststart 缓存    │
          │                         └─────────────────┬──────────────────┘
          │                                           │ /api/call (推荐/搜索/榜单/详情)
          │                                           ▼
          └── /media/ ──────────────────────▶ ┌────────────────────────────────────┐
                                              │  shortdramacat (:9587)             │
                                              │  上游二进制 (amd64 / arm64)         │
                                              └────────────────────────────────────┘
```

### 上游架构与二进制说明
- `shortdramacat` 服务使用上游项目 [kiroswu/hongguo-shortdramabox](https://github.com/kiroswu/hongguo-shortdramabox) 发布的 Linux 独立二进制（`v0.9.2`）：
  - `x86_64 / amd64`：`ShortDramaCat-v0.9.2-x86_64-linux`
  - `aarch64 / arm64`（含 Apple Silicon Mac Docker、树莓派、ARM NAS）：`ShortDramaCat-v0.9.2-aarch64-linux`
- 本仓库不直接打包上游二进制文件，`start.sh` / `start.bat` 会在首次运行时自动按架构下载并准备就绪。

---

## 🤖 AI 自动部署指南 (For AI Agents)

> 本节与根目录 [AGENTS.md](./AGENTS.md) 专为 AI Coding Agent（如 Antigravity、Claude Code、Cursor、Codex 等）编写。当你代表用户部署本项目时，请严格按以下步骤执行并验证。

### Step 1: 检查环境依赖
```bash
docker --version && docker compose version && docker info >/dev/null
```
- 若未安装或未启动 Docker，请提示用户先安装并打开 Docker Desktop（macOS/Windows）或 Docker Engine（Linux/NAS），然后停止。

### Step 2: 一键拉起服务（自动识别架构、镜像兜底下载与端口校验）
```bash
bash start.sh
```
`start.sh` 会自动判断 `x86_64` / `arm64` 并下载 `ShortDramaCat`（直连失败自动切换国内 GitHub 镜像），随后执行 `docker compose up -d --build` 并检查 `http://127.0.0.1:9588/` 是否返回 `200`。

### Step 3: 端到端健康检查（必做）
依次验证首页、搜索接口、播放地址签名接口和 `206` 视频流切片：
```bash
curl -sSf -o /dev/null -w "WEB:%{http_code}\n" http://127.0.0.1:9588/
curl -sSf -X POST http://127.0.0.1:9588/api/call \
  -H "Content-Type: application/json" \
  -d '{"method":"Search","args":["重生","0"]}' | head -c 200
```
如 `WEB:200` 且 `/api/call` 返回 `"ok":true`，再用 Python 或 `curl` 取一集的 `videoId` 调 `PlayInfo` 并对 `/v5media/...` 发 `Range: bytes=0-1023` 请求，确认返回 `HTTP 206`。

### Step 4: 返回访问地址给用户
向用户输出 `http://127.0.0.1:9588` 与局域网 IP 地址 `http://<LAN_IP>:9588`（提示用 iPhone Safari 打开并「添加到主屏幕」）。

### 常见排错
- **端口 `9588` 或 `9587` 被占用**：修改 `docker-compose.yml` 中对应 `ports` 左侧宿主机端口后重新执行 `docker compose up -d`。
- **`ShortDramaCat` 报 `exec format error`**：说明下载的二进制架构与 Docker 容器架构不一致，删除 `./ShortDramaCat` 后重新运行 `bash start.sh`。
- **更新代码后手机端仍是旧页面**：确认已重启并刷新 Safari 页面，或在 `sw.js` 递增 `CACHE` 版本号。

---

## 致谢与合规声明 (Acknowledgments & Disclaimer)

1. **上游依赖与致谢**：
   - 推荐流、榜单、搜索、剧集详情基础服务依托于开源/社区项目 [kiroswu/hongguo-shortdramabox](https://github.com/kiroswu/hongguo-shortdramabox) (`ShortDramaCat`)，其仓库未声明开源许可证（`license: null`），本项目仅通过一键脚本引导用户从其官方 Release 获取并运行，未在本仓库重新分发其二进制。
   - `v5-proxy/com/veyra/gybeyond/HongguoV5.java` 协议签名实现参考并借鉴自开源短剧聚合项目 **Veyra (`gybeyond`)**（其派生自 `MrSsg/HuangguoAPP-for-Andriod`），本项目在此基础上重构了并发设备池与 iOS 播放代理适配层。
2. **使用声明**：
   - 本项目仅供个人技术学习、iOS PWA 播放器与 HTTP Range 流媒体代理研究使用，请勿用于任何商业用途或大规模分发；请在遵守当地法律法规及上游项目条款的前提下使用。
