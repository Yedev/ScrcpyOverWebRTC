# 架构设计

## 1. 总体模型：WebSocket 中继 (ws-scrcpy 风格)

```
浏览器 ──WS(视频/控制)──▶ NestJS 后端 ──ADB──▶ Android 设备 (scrcpy-server.jar)
   ▲                          │
   └────── REST(鉴权/设备/用户) ─┘
```

与原 ScrcpyOverWebRTC 的 **WebRTC P2P** 模型不同：媒体流经过后端中转，而非浏览器↔设备直连。

| | 本项目 (WS 中继) | 原项目 (WebRTC P2P) |
|---|---|---|
| 媒体路径 | 浏览器 ↔ 后端 ↔ 设备 | 浏览器 ↔ 设备 (P2P) |
| NAT 穿透 | 靠后端可达 + 隧道 | STUN/ICE 打洞 + TURN |
| 设备侧 | 复用官方 scrcpy-server.jar | 自研 pion 原生 agent |
| 实现成本 | 低（后端即核心） | 高 |
| 延迟 | 局域网/隧道下低 | 公网 P2P 下更低 |

> **后续升级到 P2P**：`streaming` 模块的 `DeviceSession` 抽象与前端 `useDeviceStream` 的传输层已隔离，
> 可在不动业务逻辑的前提下，新增一个基于 WebRTC 的 transport（信令复用现有 WS 网关），实现混合架构。

## 2. 后端 (NestJS)

### 模块划分
- **AuthModule**：`POST /api/auth/login|register`、`GET /api/auth/me`。Passport-JWT，bcrypt 校验。
- **UsersModule**：用户 CRUD（admin），JSON 文件仓库（`data/users.json`），可替换为 TypeORM/Prisma。
- **DevicesModule**：
  - `DevicesService`：设备注册表（合并 ADB 发现的设备 + 元数据），按用户分配过滤。
  - `AdbService`：封装 `adb` CLI —— 列设备、push jar、启动 scrcpy-server、`adb forward` 拿视频/控制 socket。
- **StreamingModule / StreamingGateway**：原生 `ws` 服务器挂在 HTTP server 的 `/ws/stream` 路径上：
  1. 校验 URL 上的 JWT 与设备访问权限。
  2. 建立 `DeviceSession`：确保设备 scrcpy-server 运行，连上其视频 socket。
  3. **视频**：解析 scrcpy 流（设备名头 + 编码元数据 + 帧头含 PTS），逐帧封 `[8B 头 | H264 数据]` 经 WS 发给浏览器。
  4. **控制**：接收浏览器 JSON 指令，翻译成 scrcpy 二进制控制协议写回设备。

### 数据流（视频）
```
scrcpy-server ──H264(Annex-B)──▶ adb socket ──▶ AdbService.openVideoSocket()
   ──▶ ScrcpyVideoParser (拆 SPS/PPS/帧, 读 PTS)
   ──▶ StreamingGateway.broadcast(deviceId, frame)
   ──▶ ws.send([header|payload])  ──▶ 浏览器 WebCodecs VideoDecoder
```

### 控制协议（浏览器 → 后端，JSON）
前端发送规范化 JSON，后端负责翻译为设备二进制协议（解耦前端与 scrcpy 版本）：
```jsonc
{ "type": "touch", "action": 0, "pointerId": 0, "x": 100, "y": 200, "w": 1080, "h": 1920 }
// action: 0=DOWN 1=UP 2=MOVE
{ "type": "key", "action": 0, "keycode": 4 }      // 4=BACK, 3=HOME ...
{ "type": "scroll", "x": 100, "y": 200, "w": 1080, "h": 1920, "hScroll": 0, "vScroll": -1 }
{ "type": "text", "text": "hello" }
```

### 控制协议（后端 → 设备，scrcpy 二进制）
`streaming/scrcpy-control.ts` 实现 scrcpy ControlMessage 编码子集：
- `INJECT_KEYCODE (0)`、`INJECT_TEXT (1)`、`INJECT_TOUCH_EVENT (2)`、`INJECT_SCROLL (3)`、`BACK_OR_SCREEN_ON (4)` 等。
- ⚠️ **版本对齐**：scrcpy 控制报文格式随版本变动。务必让 `backend/assets/scrcpy-server.jar` 的版本与
  `scrcpy-control.ts` 中的编码格式一致（代码注释标注了对应 scrcpy 版本）。

## 3. 前端 (React + Vite + TS)

- **路由**：`/login`、`/`(设备列表)、`/device/:serial`(控制页)。`ProtectedRoute` 校验 JWT。
- **api/client.ts**：fetch 封装，自动注入 `Authorization: Bearer`，401 自动登出（对标原项目拦截器）。
- **store/auth.ts**：zustand，token 持久化到 localStorage。
- **lib/h264-decoder.ts**：基于 WebCodecs `VideoDecoder`，把后端转发的 H264 帧解码到 canvas。
- **lib/control-protocol.ts**：把指针/键盘事件归一化成上面的 JSON，按设备坐标换算后经 WS 发送。
- **lib/device-stream.ts**：WS 连接管理、二进制帧拆头、重连。

## 4. Mock 模式（无真机验证骨架）
`MOCK_DEVICES=true` 时：
- `DevicesService` 注入若干虚拟设备。
- `DeviceSession` 进入 mock：不连 adb，按固定帧率发送 `{type:'mock-frame', seq, ts, w, h}` 元数据帧。
- 前端识别 mock 帧，在 canvas 上自绘测试图案（移动方块 + 序号 + 时间戳），并把控制指令回显到日志。
- 用途：在 CI / 无设备环境下验证鉴权、WS、渲染循环、控制回传等全链路。

## 5. 安全基线（针对原项目问题的改进）
| 原项目问题 | 本项目改进 |
|---|---|
| 硬编码 admin/admin123 | 默认随机/`ADMIN_PASSWORD` 注入，强制首登改密提示 |
| 单轮 SHA256 | bcrypt（可配 rounds） |
| 全程明文、闭源二进制 | 全开源；文档要求 TLS 反代；WS 同样校验 JWT |
| Agent 高权限默认外联 | 复用官方 scrcpy-server，无第三方外联；后端出口可控 |

### 生产加固
- TLS：前置 Caddy/nginx 反代 `:443` → 后端 `:3000`，WS 自动升级 `wss`。
- 鉴权边界：非 admin 用户经 `assignedDevices` 限制可见设备。
- 网络暴露：建议仅经 Tailscale/VPN 暴露，勿裸奔公网。

## 6. 升级到 WebRTC P2P 的路线（可选）
1. 复用 `StreamingGateway` 作为**信令**通道（offer/answer/ICE 走现有 WS）。
2. 设备侧引入 pion/webrtc 的原生 agent（或在后端做 SFU 转发）。
3. 前端 `lib/device-stream.ts` 增加 `WebRtcTransport`，与现有 `WsTransport` 同接口切换。
4. 自建 coturn 提供 STUN/TURN 兜底；优先 IPv6 直连穿 CGNAT。
