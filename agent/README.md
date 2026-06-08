# cloudphone-agent (Node/TypeScript)

设备侧 **WebRTC agent**：连接 scrcpy-server 取 H264，经 WebRTC 与浏览器 **P2P 直连**，
后端只做信令。用 [werift](https://github.com/shinyoshiaki/werift-webrtc)（纯 TS WebRTC），全栈统一。

```
浏览器 ◀──── WebRTC P2P (视频track + 控制datachannel) ────▶ agent ──adb/scrcpy──▶ 手机
   ▲                                                          │
   └──────────── 信令(offer/answer/ICE) ── NestJS 后端 ◀──────┘   ← 后端不碰媒体
```

**运行模式（host 模式）**：agent 跑在装有 `adb` 的机器上，通过 USB/网络 adb 驱动设备。
这台机器成为浏览器的 P2P 对端（后端不在媒体路径里）。

## 前置
- Node.js ≥ 18
- 宿主机装好 `adb`，且 `adb devices` 能看到目标设备
- `scrcpy-server.jar`（版本要与 `--scrcpy-version` 一致；可直接复用原仓库 `agentd/scrcpy-server.jar`，那是 **3.3.4**）

## 安装与启动
```bash
cd agent
npm install
npm run build

# 启动（把 scrcpy-server.jar 放好，版本对齐）
node dist/index.js \
  --id my-phone \
  --signaling ws://<后端IP>:3000/ws/agent \
  --key <与后端 AGENT_KEY 一致> \
  --scrcpy-jar ./scrcpy-server.jar \
  --scrcpy-version 3.3.4 \
  --serial <adb序列号，可选>

# 开发模式（免编译）
npm run dev -- --id my-phone --signaling ws://127.0.0.1:3000/ws/agent --key dev-agent-key --scrcpy-version 3.3.4
```
也可用环境变量（见 `.env.example`）代替命令行参数。

启动后，agent 会在后端注册；刷新网页 **设备列表** 即可看到它出现在「P2P 设备 · WebRTC 直连」区，点「P2P 连接」进入直连控制页。

## 参数
| 参数 | 环境变量 | 说明 | 默认 |
|------|----------|------|------|
| `--id` | `AGENT_ID` | 设备唯一标识（必填） | — |
| `--name` | `AGENT_NAME` | 显示名 | 同 id |
| `--signaling` | `SIGNALING_URL` | 后端 `/ws/agent` 地址 | `ws://127.0.0.1:3000/ws/agent` |
| `--key` | `AGENT_KEY` | 与后端一致的共享密钥 | `dev-agent-key` |
| `--adb` | `ADB_PATH` | adb 路径 | `adb` |
| `--serial` | `ADB_SERIAL` | 多设备时指定序列号 | 空 |
| `--scrcpy-jar` | `SCRCPY_LOCAL_JAR` | 本地 jar 路径 | `./scrcpy-server.jar` |
| `--scrcpy-version` | `SCRCPY_VERSION` | 必须与 jar 版本一致 | `2.4` |
| `--bitrate` / `--max-fps` / `--max-size` | `BITRATE`/`MAX_FPS`/`MAX_SIZE` | 视频参数 | 4Mbps/不限/不限 |
| `--stun` | `STUN_URL` | STUN 服务器 | Google STUN |

## 实现要点
- `scrcpy.ts`：push jar、`adb forward`、启动 server、读 H264 帧、回写控制（与后端逻辑一致）。
- `h264.ts`：Annex-B → RTP（FU-A 分片，90kHz 时间戳）。werift 的 sender 会自动改写 ssrc/payloadType，故只需保证帧封装与时间戳正确。
- `webrtc.ts`：werift PeerConnection（H264 sendonly track + 控制 datachannel），单观看者模式。
- `signaling.ts`：`/ws/agent` 客户端，断线指数退避重连。

## 关于"跑在手机里"
当前是 host 模式（agent 在电脑上）。若要像原项目那样让 agent **跑在手机自身**（脱离电脑），
Node 在 stock Android 上需要额外运行时（Termux 等），较麻烦；那种场景更适合静态二进制。
此处优先保证全栈一致与可测试性。
