import { spawn, ChildProcess } from 'child_process';
import { connect, Socket } from 'net';
import { AgentConfig } from './config';

export interface Frame {
  data: Buffer; // H264 Annex-B 访问单元
  config: boolean; // SPS/PPS 配置帧
  keyframe: boolean;
  ptsUs: number; // 微秒
}

const PTS_FLAG_CONFIG = 1n << 63n;
const PTS_FLAG_KEYFRAME = 1n << 62n;

/**
 * 设备侧 scrcpy 集成：push jar、启动 server、读 H264、回写控制。
 * host 模式：在装有 adb 的机器上运行，通过 adb 驱动 USB/网络连接的设备。
 */
export class Scrcpy {
  private videoConn?: Socket;
  private controlConn?: Socket;
  private serverProc?: ChildProcess;
  private forwardPort = 0;
  private stopped = false;

  constructor(private readonly cfg: AgentConfig) {}

  private adbBase(): string[] {
    return this.cfg.serial ? ['-s', this.cfg.serial] : [];
  }

  private exec(args: string[], timeoutMs = 60_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.cfg.adbPath, [...this.adbBase(), ...args], { windowsHide: true });
      let out = '';
      let err = '';
      const t = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`adb ${args.join(' ')} timeout`));
      }, timeoutMs);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(t);
        code === 0 ? resolve(out) : reject(new Error(`adb exited ${code}: ${err || out}`));
      });
    });
  }

  async start(): Promise<void> {
    const { cfg } = this;
    console.log(`[scrcpy] push ${cfg.scrcpyLocalJar} -> ${cfg.scrcpyRemoteJar}`);
    await this.exec(['push', cfg.scrcpyLocalJar, cfg.scrcpyRemoteJar]);

    const fwd = await this.exec(['forward', 'tcp:0', 'localabstract:scrcpy'], 10_000);
    this.forwardPort = parseInt(fwd.trim(), 10);
    if (!Number.isFinite(this.forwardPort)) throw new Error(`adb forward 返回异常: ${fwd}`);
    console.log(`[scrcpy] forward -> 127.0.0.1:${this.forwardPort}`);

    // 启动 server：只留逐帧头，关掉版本敏感前缀（与后端一致）
    const serverArgs = [
      ...this.adbBase(),
      'shell',
      `CLASSPATH=${cfg.scrcpyRemoteJar}`,
      'app_process', '/', 'com.genymobile.scrcpy.Server',
      cfg.scrcpyVersion,
      'tunnel_forward=true', 'audio=false', 'control=true',
      `max_size=${cfg.maxSize}`, `video_bit_rate=${cfg.bitrate}`, `max_fps=${cfg.maxFps}`,
      'send_frame_meta=true', 'send_device_meta=false', 'send_codec_meta=false', 'send_dummy_byte=false',
    ];
    console.log(`[scrcpy] starting server (version ${cfg.scrcpyVersion})`);
    this.serverProc = spawn(cfg.adbPath, serverArgs, { windowsHide: true });
    this.serverProc.stderr?.on('data', (d) => process.stderr.write(`[scrcpy-server] ${d}`));
    this.serverProc.on('exit', (c) => console.log(`[scrcpy] server exited: ${c}`));

    // tunnel_forward：先 video，再 control
    this.videoConn = await this.dialRetry();
    this.controlConn = await this.dialRetry();
    console.log('[scrcpy] video & control sockets connected');
  }

  private dialRetry(attempts = 30): Promise<Socket> {
    return new Promise((resolve, reject) => {
      let n = 0;
      const tryConnect = () => {
        const sock = connect({ host: '127.0.0.1', port: this.forwardPort });
        sock.once('connect', () => resolve(sock));
        sock.once('error', () => {
          if (++n >= attempts) return reject(new Error('connect scrcpy socket failed'));
          setTimeout(tryConnect, 100);
        });
      };
      tryConnect();
    });
  }

  /** 持续读取并回调每一帧；返回的 promise 在流结束时 resolve/reject */
  async readFrames(onFrame: (f: Frame) => void): Promise<void> {
    const reader = new SocketReader(this.videoConn!);
    let first = true;
    while (!this.stopped) {
      const meta = await reader.read(12);
      const ptsRaw = meta.readBigUInt64BE(0);
      const size = meta.readUInt32BE(8);
      const config = (ptsRaw & PTS_FLAG_CONFIG) !== 0n;
      const keyframe = (ptsRaw & PTS_FLAG_KEYFRAME) !== 0n;
      const ptsUs = Number(ptsRaw & ~(PTS_FLAG_CONFIG | PTS_FLAG_KEYFRAME));
      const data = await reader.read(size);
      if (first) {
        console.log(`[scrcpy] first packet size=${size} config=${config} keyframe=${keyframe}`);
        first = false;
      }
      onFrame({ data, config, keyframe, ptsUs });
    }
  }

  /** 浏览器 JSON 控制指令 → scrcpy 二进制，写回设备 */
  sendControl(json: Buffer | string): void {
    if (!this.controlConn) return;
    let m: any;
    try {
      m = JSON.parse(json.toString());
    } catch {
      return;
    }
    const buf = encodeControl(m);
    if (buf) this.controlConn.write(buf);
  }

  stop(): void {
    this.stopped = true;
    this.videoConn?.destroy();
    this.controlConn?.destroy();
    this.serverProc?.kill('SIGKILL');
    if (this.forwardPort) {
      this.exec(['forward', '--remove', `tcp:${this.forwardPort}`]).catch(() => undefined);
    }
  }
}

/** 读取确定字节数的异步 reader */
class SocketReader {
  private buffer = Buffer.alloc(0);
  private waiting?: { n: number; resolve: (b: Buffer) => void; reject: (e: Error) => void };

  constructor(sock: Socket) {
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

// ---------- scrcpy 控制协议编码（与后端 scrcpy-control.ts 对齐，scrcpy 2.x） ----------
const T_KEY = 0, T_TEXT = 1, T_TOUCH = 2, T_SCROLL = 3, T_BACK = 4;

function encodeControl(m: any): Buffer | null {
  switch (m.type) {
    case 'touch': return touch(m);
    case 'key': return key(m);
    case 'scroll': return scroll(m);
    case 'text': return text(m.text ?? '');
    case 'backOrScreenOn': return Buffer.from([T_BACK, m.action ?? 0]);
    default: return null;
  }
}
function fp(action: number, p: number): number {
  if (action === 1) return 0;
  const v = Math.max(0, Math.min(1, p || 1));
  return Math.round(v * 0xffff);
}
function fs(v: number): number {
  const c = Math.max(-1, Math.min(1, v || 0));
  return Math.round(c * (c < 0 ? 32768 : 32767));
}
function touch(m: any): Buffer {
  const b = Buffer.alloc(32);
  let o = 0;
  b.writeUInt8(T_TOUCH, o++); b.writeUInt8(m.action, o++);
  const pid = m.pointerId < 0 ? 0xffffffffffffffffn : BigInt(m.pointerId);
  b.writeBigUInt64BE(pid, o); o += 8;
  b.writeInt32BE(Math.round(m.x), o); o += 4;
  b.writeInt32BE(Math.round(m.y), o); o += 4;
  b.writeUInt16BE(m.w, o); o += 2;
  b.writeUInt16BE(m.h, o); o += 2;
  b.writeUInt16BE(fp(m.action, m.pressure), o); o += 2;
  b.writeUInt32BE(0, o); o += 4;
  b.writeUInt32BE(m.action === 0 || m.action === 2 ? 1 : 0, o);
  return b;
}
function key(m: any): Buffer {
  const b = Buffer.alloc(14);
  b.writeUInt8(T_KEY, 0); b.writeUInt8(m.action, 1);
  b.writeUInt32BE(m.keycode >>> 0, 2);
  b.writeUInt32BE((m.repeat ?? 0) >>> 0, 6);
  b.writeUInt32BE((m.metaState ?? 0) >>> 0, 10);
  return b;
}
function text(s: string): Buffer {
  const p = Buffer.from(s, 'utf-8');
  const b = Buffer.alloc(5 + p.length);
  b.writeUInt8(T_TEXT, 0); b.writeUInt32BE(p.length, 1); p.copy(b, 5);
  return b;
}
function scroll(m: any): Buffer {
  const b = Buffer.alloc(21);
  let o = 0;
  b.writeUInt8(T_SCROLL, o++);
  b.writeInt32BE(Math.round(m.x), o); o += 4;
  b.writeInt32BE(Math.round(m.y), o); o += 4;
  b.writeUInt16BE(m.w, o); o += 2;
  b.writeUInt16BE(m.h, o); o += 2;
  b.writeInt16BE(fs(m.hScroll), o); o += 2;
  b.writeInt16BE(fs(m.vScroll), o); o += 2;
  b.writeUInt32BE(0, o);
  return b;
}
