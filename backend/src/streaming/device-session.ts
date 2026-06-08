import { Logger } from '@nestjs/common';
import { Socket } from 'net';
import { ChildProcess } from 'child_process';
import { AdbService } from '../devices/adb.service';
import { DeviceInfo, StreamOptions, DEFAULT_STREAM_OPTIONS } from '../devices/device.model';
import { ControlMessage } from './control-messages';
import { ScrcpyControlEncoder } from './scrcpy-control';

export interface VideoFrame {
  config: boolean; // 是否为 SPS/PPS 配置帧
  keyframe: boolean;
  seq: number;
  ptsMs: number;
  data: Buffer; // H264 (Annex-B)
}

export interface SessionCallbacks {
  /** 真机模式：H264 视频帧 */
  onVideo: (frame: VideoFrame) => void;
  /** 控制类文本消息（ready / mock-frame / error 等，JSON） */
  onText: (obj: Record<string, unknown>) => void;
}

const PTS_FLAG_KEYFRAME = 1n << 62n;
const PTS_FLAG_CONFIG = 1n << 63n;

/**
 * 管理单台设备的一路推流会话。两种模式：
 *  - mock：不接 adb，定时发送 mock-frame 元数据，前端自绘测试图案。
 *  - real：push+启动 scrcpy-server，经 adb forward 读取 H264 视频并转发；控制指令翻译回写。
 */
export class DeviceSession {
  private readonly logger = new Logger(`DeviceSession`);
  private seq = 0;
  private mockTimer?: NodeJS.Timeout;
  private serverProc?: ChildProcess;
  private videoSocket?: Socket;
  private controlSocket?: Socket;
  private forwardPort?: number;
  private stopped = false;
  private opts: StreamOptions;

  constructor(
    private readonly device: DeviceInfo,
    private readonly mock: boolean,
    private readonly adb: AdbService,
    private readonly cb: SessionCallbacks,
    private readonly scrcpyRemoteJar: string,
    private readonly scrcpyLocalJar: string,
    private readonly scrcpyVersion: string,
    opts?: Partial<StreamOptions>,
  ) {
    this.opts = { ...DEFAULT_STREAM_OPTIONS, ...opts };
  }

  async start(): Promise<void> {
    this.cb.onText({ type: 'ready', device: this.device as unknown as Record<string, unknown>, mock: this.mock });
    if (this.mock) return this.startMock();
    return this.startReal();
  }

  private startMock() {
    const { width, height } = this.device.resolution ?? { width: 720, height: 1280 };
    const fps = 15;
    this.mockTimer = setInterval(() => {
      if (this.stopped) return;
      this.cb.onText({ type: 'mock-frame', seq: this.seq++, ts: Date.now(), w: width, h: height });
    }, 1000 / fps);
    this.logger.log(`[${this.device.serial}] mock session started (${width}x${height}@${fps})`);
  }

  private async startReal() {
    const serial = this.device.serial;
    try {
      await this.adb.push(serial, this.scrcpyLocalJar, this.scrcpyRemoteJar);
      this.forwardPort = await this.adb.forwardScrcpy(serial);
      this.serverProc = this.adb.startScrcpyServer(serial, this.scrcpyRemoteJar, this.opts, this.scrcpyVersion);

      // tunnel_forward 模式下客户端主动连接；第一条为视频，第二条为控制。
      this.videoSocket = await this.connectWithRetry(this.forwardPort);
      this.controlSocket = await this.connectWithRetry(this.forwardPort);
      this.videoSocket.on('error', (e) => this.fail(`video socket: ${e.message}`));
      this.controlSocket.on('error', (e) => this.fail(`control socket: ${e.message}`));
      this.logger.log(`[${serial}] sockets connected, reading H264 frames…`);

      await this.readFrames(this.videoSocket);
    } catch (e) {
      this.fail((e as Error).message);
    }
  }

  private async connectWithRetry(port: number, attempts = 20): Promise<Socket> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await this.adb.openSocket(port);
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error(`无法连接到 scrcpy socket (port ${port})`);
  }

  /**
   * 读取 scrcpy 视频流。已在启动参数里关闭 dummy/设备名/编码元数据前缀，
   * 因此这里直接进入帧循环（send_frame_meta=true）：
   *   [PTS(8B, 高 2 位含 config/keyframe 标志)][size(4B)][H264 数据]。
   * 帧头布局需与 scrcpy 版本对齐。
   */
  private async readFrames(sock: Socket) {
    const reader = new SocketReader(sock);
    let logged = false;
    while (!this.stopped) {
      const meta = await reader.read(12);
      const ptsRaw = meta.readBigUInt64BE(0);
      const size = meta.readUInt32BE(8);
      const config = (ptsRaw & PTS_FLAG_CONFIG) !== 0n;
      const keyframe = (ptsRaw & PTS_FLAG_KEYFRAME) !== 0n;
      const pts = ptsRaw & ~(PTS_FLAG_CONFIG | PTS_FLAG_KEYFRAME);
      const data = await reader.read(size);
      if (!logged) {
        this.logger.log(
          `[${this.device.serial}] first packet: size=${size} config=${config} keyframe=${keyframe}`,
        );
        logged = true;
      }
      this.cb.onVideo({
        config,
        keyframe,
        seq: this.seq++,
        ptsMs: Number(pts / 1000n),
        data,
      });
    }
  }

  sendControl(msg: ControlMessage) {
    if (this.mock) {
      this.cb.onText({ type: 'control-ack', echo: msg as unknown as Record<string, unknown> });
      return;
    }
    if (!this.controlSocket) return;
    let buf: Buffer | null = null;
    switch (msg.type) {
      case 'touch': buf = ScrcpyControlEncoder.touch(msg); break;
      case 'key': buf = ScrcpyControlEncoder.keycode(msg); break;
      case 'scroll': buf = ScrcpyControlEncoder.scroll(msg); break;
      case 'text': buf = ScrcpyControlEncoder.text(msg.text); break;
      case 'backOrScreenOn': buf = ScrcpyControlEncoder.backOrScreenOn(msg.action); break;
      default: return; // setOptions 等在上层处理
    }
    if (buf) this.controlSocket.write(buf);
  }

  private fail(reason: string) {
    if (this.stopped) return;
    this.logger.error(`[${this.device.serial}] session failed: ${reason}`);
    this.cb.onText({ type: 'error', message: reason });
    this.stop();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.mockTimer) clearInterval(this.mockTimer);
    this.videoSocket?.destroy();
    this.controlSocket?.destroy();
    this.serverProc?.kill('SIGKILL');
    if (this.forwardPort) this.adb.removeForward(this.device.serial, this.forwardPort);
    this.logger.log(`[${this.device.serial}] session stopped`);
  }
}

/** 把 net.Socket 包成"读取确定字节数"的异步 reader */
class SocketReader {
  private buffer = Buffer.alloc(0);
  private waiting?: { n: number; resolve: (b: Buffer) => void; reject: (e: Error) => void };

  constructor(private readonly sock: Socket) {
    sock.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.tryResolve();
    });
    sock.on('close', () => this.waiting?.reject(new Error('socket closed')));
    sock.on('error', (e) => this.waiting?.reject(e));
  }

  read(n: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.waiting = { n, resolve, reject };
      this.tryResolve();
    });
  }

  private tryResolve() {
    if (!this.waiting || this.buffer.length < this.waiting.n) return;
    const { n, resolve } = this.waiting;
    const out = this.buffer.subarray(0, n);
    this.buffer = this.buffer.subarray(n);
    this.waiting = undefined;
    resolve(out);
  }
}
