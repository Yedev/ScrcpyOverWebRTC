import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, ChildProcess } from 'child_process';
import { connect, Socket } from 'net';
import { AppConfig } from '../config/configuration';
import { DeviceInfo, DeviceStatus, StreamOptions } from './device.model';

/**
 * adb CLI 封装。所有参数都以数组形式传给 spawn（不经过 shell），避免命令注入。
 * 真机相关方法只有在 MOCK_DEVICES=false 且宿主机有 adb 时才会被实际调用。
 */
@Injectable()
export class AdbService {
  private readonly logger = new Logger(AdbService.name);
  private readonly adb: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.adb = config.get('adbPath', { infer: true });
  }

  /** 执行一次性 adb 命令，返回 stdout 字符串 */
  private exec(args: string[], timeoutMs = 10_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.adb, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`adb ${args.join(' ')} timed out`));
      }, timeoutMs);
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(stdout);
        else reject(new Error(`adb exited ${code}: ${stderr || stdout}`));
      });
    });
  }

  /** 解析 `adb devices -l` */
  async listDevices(): Promise<DeviceInfo[]> {
    let out: string;
    try {
      out = await this.exec(['devices', '-l']);
    } catch (e) {
      this.logger.warn(`adb devices failed: ${(e as Error).message}`);
      return [];
    }
    const devices: DeviceInfo[] = [];
    for (const line of out.split('\n').slice(1)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [serial, state, ...rest] = trimmed.split(/\s+/);
      if (!serial) continue;
      const statusMap: Record<string, DeviceStatus> = {
        device: 'online',
        offline: 'offline',
        unauthorized: 'unauthorized',
      };
      const meta = rest.join(' ');
      const model = /model:(\S+)/.exec(meta)?.[1]?.replace(/_/g, ' ');
      devices.push({
        serial,
        name: model ?? serial,
        model,
        status: statusMap[state] ?? 'offline',
        lastSeen: new Date().toISOString(),
      });
    }
    return devices;
  }

  /** 读取设备属性（如 ro.build.version.release） */
  async getProp(serial: string, prop: string): Promise<string> {
    const out = await this.exec(['-s', serial, 'shell', 'getprop', prop]);
    return out.trim();
  }

  /** 推送本地文件到设备 */
  async push(serial: string, local: string, remote: string): Promise<void> {
    await this.exec(['-s', serial, 'push', local, remote], 60_000);
  }

  /**
   * 建立 adb forward：把设备上的 localabstract:scrcpy 转发到宿主机一个随机本地端口。
   * 返回分配到的本地端口号。
   */
  async forwardScrcpy(serial: string): Promise<number> {
    const out = await this.exec(['-s', serial, 'forward', 'tcp:0', 'localabstract:scrcpy']);
    const port = parseInt(out.trim(), 10);
    if (!Number.isFinite(port)) throw new Error(`adb forward returned unexpected: ${out}`);
    return port;
  }

  async removeForward(serial: string, localPort: number): Promise<void> {
    await this.exec(['-s', serial, 'forward', '--remove', `tcp:${localPort}`]).catch(() => undefined);
  }

  /**
   * 启动设备上的 scrcpy-server（通过 app_process）。
   * 注意：参数顺序/键值随 scrcpy 版本变化，需与 assets/scrcpy-server.jar 版本对齐。
   * 这里给出 scrcpy 2.x 风格的调用骨架。
   */
  startScrcpyServer(serial: string, remoteJar: string, opts: StreamOptions, scrcpyVersion = '2.4'): ChildProcess {
    const args = [
      '-s',
      serial,
      'shell',
      `CLASSPATH=${remoteJar}`,
      'app_process',
      '/',
      'com.genymobile.scrcpy.Server',
      scrcpyVersion,
      'tunnel_forward=true',
      'audio=false',
      'control=true',
      `max_size=${opts.maxSize}`,
      `video_bit_rate=${opts.bitrate}`,
      `max_fps=${opts.maxFps}`,
      'send_frame_meta=true',
    ];
    this.logger.log(`Starting scrcpy-server on ${serial}: ${args.join(' ')}`);
    const child = spawn(this.adb, args, { windowsHide: true });
    child.stderr.on('data', (d) => this.logger.debug(`[scrcpy ${serial}] ${d}`));
    return child;
  }

  /** 连接到 forward 出来的本地端口，得到 scrcpy 的视频/控制 socket */
  openSocket(localPort: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const sock = connect({ host: '127.0.0.1', port: localPort }, () => resolve(sock));
      sock.once('error', reject);
    });
  }
}
