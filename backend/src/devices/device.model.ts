export type DeviceStatus = 'online' | 'offline' | 'unauthorized';

export interface DeviceInfo {
  /** adb serial（唯一标识） */
  serial: string;
  name: string;
  model?: string;
  androidVersion?: string;
  resolution?: { width: number; height: number };
  status: DeviceStatus;
  /** 是否为 mock 模式注入的虚拟设备 */
  mock?: boolean;
  lastSeen: string;
}

export interface StreamOptions {
  /** 视频码率 bps */
  bitrate: number;
  /** 最大帧率，0=不限 */
  maxFps: number;
  /** 视频最长边，0=不限 */
  maxSize: number;
}

export const DEFAULT_STREAM_OPTIONS: StreamOptions = {
  bitrate: 4_000_000,
  maxFps: 0,
  maxSize: 0,
};
