// cloudphone-agent: 设备侧 WebRTC agent (Node/TS, werift)。
// 连 scrcpy-server 取 H264，经 WebRTC 与浏览器 P2P 直连；后端仅做信令。
// host 模式：在装有 adb 的机器上运行，通过 adb 驱动 USB/网络连接的设备。
import { loadConfig } from './config';
import { Scrcpy } from './scrcpy';
import { WebRTCHub, IceServer } from './webrtc';
import { Signaling } from './signaling';

async function main() {
  const cfg = loadConfig(process.argv.slice(2));
  if (!cfg.id) {
    console.error('错误：必须用 --id 或环境变量 AGENT_ID 指定设备标识');
    process.exit(1);
  }
  console.log(`[agent] starting device '${cfg.id}' (scrcpy ${cfg.scrcpyVersion})`);

  const scrcpy = new Scrcpy(cfg);
  await scrcpy.start();

  const iceServers: IceServer[] = [{ urls: cfg.stunUrl }];
  if (cfg.turnUrl) {
    iceServers.push({ urls: cfg.turnUrl, username: cfg.turnUsername, credential: cfg.turnCredential });
    console.log(`[agent] using TURN: ${cfg.turnUrl}`);
  }
  const hub = new WebRTCHub(scrcpy, iceServers);
  const signaling = new Signaling(cfg, hub);
  hub.setSender(signaling);

  // 帧泵：持续把 H264 帧喂给当前 peer
  scrcpy
    .readFrames((f) => hub.writeFrame(f))
    .catch((e) => {
      console.error('[agent] 视频流结束:', e.message);
      cleanup(scrcpy, 1);
    });

  signaling.run();
  console.log('[agent] ready, waiting for browsers to connect…');

  process.on('SIGINT', () => cleanup(scrcpy, 0));
  process.on('SIGTERM', () => cleanup(scrcpy, 0));
}

function cleanup(scrcpy: Scrcpy, code: number) {
  console.log('[agent] shutting down…');
  scrcpy.stop();
  process.exit(code);
}

main().catch((e) => {
  console.error('[agent] fatal:', e);
  process.exit(1);
});
