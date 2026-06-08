import { VideoFrame as StreamFrame } from './device-stream';

/**
 * 基于 WebCodecs 的 H264 解码器，把后端转发的 Annex-B H264 帧解到 canvas。
 * 仅在真机模式使用（mock 模式由 DeviceScreen 自绘）。
 * 需要支持 WebCodecs 的浏览器（Chrome/Edge 94+，部分 Safari）。
 *
 * 注：这里对 WebCodecs 全局对象使用动态访问 + any，避免对 TS DOM lib 的
 * WebCodecs 类型声明产生硬依赖（不同 TS 版本是否内置该声明不一致）。
 */
const W = window as any;

export class H264Decoder {
  private decoder?: any; // VideoDecoder
  private configData?: Uint8Array; // SPS/PPS，附加到首个关键帧
  private ctx: CanvasRenderingContext2D | null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onResize?: (w: number, h: number) => void,
  ) {
    this.ctx = canvas.getContext('2d');
  }

  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'VideoDecoder' in window;
  }

  private ensureDecoder() {
    if (this.decoder) return;
    this.decoder = new W.VideoDecoder({
      output: (frame: any) => this.render(frame),
      error: (e: unknown) => console.error('[H264Decoder]', e),
    });
    // baseline/main 通用 codec 串；annex-b 不带 description
    this.decoder.configure({ codec: 'avc1.42E01E', optimizeForLatency: true });
  }

  decode(frame: StreamFrame) {
    if (!H264Decoder.isSupported()) return;
    this.ensureDecoder();
    if (frame.config) {
      this.configData = frame.data; // 缓存 SPS/PPS，等待关键帧
      return;
    }
    let payload = frame.data;
    if (frame.keyframe && this.configData) {
      payload = concat(this.configData, frame.data);
    }
    try {
      const chunk = new W.EncodedVideoChunk({
        type: frame.keyframe ? 'key' : 'delta',
        timestamp: frame.ptsMs * 1000,
        data: payload,
      });
      this.decoder.decode(chunk);
    } catch (e) {
      console.error('[H264Decoder] decode failed', e);
    }
  }

  private render(frame: any) {
    if (this.ctx) {
      if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
        this.canvas.width = frame.displayWidth;
        this.canvas.height = frame.displayHeight;
        this.onResize?.(frame.displayWidth, frame.displayHeight);
      }
      this.ctx.drawImage(frame, 0, 0);
    }
    frame.close();
  }

  close() {
    try {
      this.decoder?.close();
    } catch {
      /* ignore */
    }
    this.decoder = undefined;
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
