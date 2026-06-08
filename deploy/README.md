# 生产部署（有域名 + 远程物理手机 / WebRTC P2P）

服务器上一键起 **Caddy(自动HTTPS) + backend(信令) + coturn(TURN)**；
手机旁的机器跑 **agent** 主动拨出连服务器。媒体走浏览器↔agent P2P，后端不碰媒体。

```
☁️ 服务器 (域名 cloud.example.com)              🏠 手机所在网络
  Caddy :443  ──┬─ /        前端静态              agent ──wss://域名/ws/agent──▶ 信令
                ├─ /api/*  ─▶ backend:3000        adb ─▶ 📱
                └─ /ws/*   ─▶ backend:3000
  coturn :3478 (+49160-49200/udp)  ◀──── 媒体打洞失败时中转 ────▶
        ▲ 浏览器 https 访问
```

## 一、准备
1. 一台有**公网 IP** 的服务器，装好 Docker + Docker Compose。
2. 一个**域名**，把 A 记录解析到服务器公网 IP。
3. 放行防火墙/安全组端口：

| 端口 | 协议 | 用途 |
|------|------|------|
| 80 | TCP | Caddy 申请证书 + 跳转 HTTPS |
| 443 | TCP | HTTPS / WSS（网页、信令） |
| 3478 | UDP + TCP | TURN / STUN |
| 49160-49200 | UDP | TURN 媒体中继端口段 |

## 二、部署服务器端
```bash
# 拉代码（cloudphone-platform 分支）
git clone -b cloudphone-platform <你的仓库> cloudphone && cd cloudphone/deploy

# 配置
cp .env.example .env
# 编辑 .env：填 DOMAIN、PUBLIC_IP，并用 openssl 生成强密钥
#   openssl rand -hex 32   → JWT_SECRET
#   openssl rand -hex 16   → AGENT_KEY
#   openssl rand -hex 16   → TURN_PASS
nano .env

# 起服务（首次会构建前端镜像 + 后端镜像）
docker compose up -d --build

# 看日志，记下首启打印的随机管理员密码（若 ADMIN_PASSWORD 留空）
docker compose logs -f backend
```
几十秒后访问 `https://你的域名` 应能打开登录页（Caddy 已自动签好证书）。用 `admin` + 你设/日志里的密码登录。

## 三、接入手机（在每台手机旁的机器上跑 agent）
agent 装在**能 `adb` 到手机**的机器上（手机旁的小主机/笔记本/树莓派）。它只需要**出站网络**，手机在家里 NAT 后面也行，**无需端口转发**。

```bash
# 该机器需要：Node ≥18、adb、scrcpy-server.jar
cd cloudphone/agent
npm install && npm run build
# 放一个匹配版本的 jar（原仓库那个是 3.3.4）
git show main:agentd/scrcpy-server.jar > scrcpy-server.jar

adb devices            # 确认能看到手机

node dist/index.js \
  --id phone-01 \
  --signaling wss://你的域名/ws/agent \
  --key <.env里的 AGENT_KEY> \
  --scrcpy-jar ./scrcpy-server.jar \
  --scrcpy-version 3.3.4 \
  --turn turn:<服务器公网IP>:3478?transport=udp \
  --turn-user cloudphone \
  --turn-pass <.env里的 TURN_PASS> \
  --serial <adb序列号，多设备时填>
```
> 也可把这些写进 agent 目录的 `.env`（见 `agent/.env.example`），用 `npm run dev` 跑。
> 想开机自启/守护，用 systemd 或 pm2 包一下即可。

## 四、后面咋连（日常使用）
1. 浏览器（**Chrome/Edge**）打开 `https://你的域名`，登录。
2. agent 在线的手机会出现在 **「P2P 设备 · WebRTC 直连」** 区。
3. 点 **「P2P 连接」**：浏览器和 agent 之间 WebRTC 直连（打不通则经 TURN 中转），画面原生播放，触摸/按键经 DataChannel 回传。

浏览器侧的 STUN/TURN 由后端 `/api/ice-servers` 自动下发，无需手动配置；agent 侧用上面的 `--turn` 参数。

## 五、排查
| 现象 | 排查 |
|------|------|
| 网页打不开 / 证书错误 | 域名 A 记录是否指向本机？80/443 是否放行？`docker compose logs caddy` |
| 设备列表没有手机 | agent 是否成功连上？看 agent 日志有无 `registered as device`；`--key` 是否与服务器 `AGENT_KEY` 一致 |
| 点连接后一直连不上、黑屏 | 多半是 NAT 打洞失败且 TURN 没生效：确认 3478/UDP 与 49160-49200/UDP 放行、`PUBLIC_IP` 填对、agent 带了 `--turn` |
| 连上但触摸/按键无反应 | scrcpy 控制协议版本差异；告知 jar 版本以对齐 |
| 想确认是否走了 TURN | Chrome 开 `chrome://webrtc-internals`，看选中的 candidate pair 是否为 relay |

## 六、安全提醒
- `.env` 里所有密钥务必改成强随机值；`.env` 不要提交进仓库。
- TURN 用的是静态凭据，足够自用；要更严可改用 coturn 的 `use-auth-secret`（时效凭据），后端 `/api/ice-servers` 侧再相应生成。
- 仅放行上述端口；管理面建议再加 IP 白名单或放在 VPN 后。
