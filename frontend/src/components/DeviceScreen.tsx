import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { DeviceStream } from '../lib/device-stream';
import { H264Decoder } from '../lib/h264-decoder';
import { touch, TouchAction, KeyAction, ControlMessage } from '../lib/control-protocol';

export interface DeviceScreenHandle {
  sendKey: (keycode: number) => void;
  backOrScreenOn: () => void;
}

interface Props {
  serial: string;
  onStatus?: (status: string) => void;
  onLog?: (line: string) => void;
}

/**
 * 设备画面：建立 WS、解码渲染、采集触摸/按键回传。
 * mock 模式自绘测试图案；真机模式用 WebCodecs 解码 H264。
 */
export const DeviceScreen = forwardRef<DeviceScreenHandle, Props>(function DeviceScreen(
  { serial, onStatus, onLog },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<DeviceStream | null>(null);
  const decoderRef = useRef<H264Decoder | null>(null);
  const sizeRef = useRef({ w: 1080, h: 1920 });
  const mockRef = useRef(false);

  useImperativeHandle(ref, () => ({
    sendKey(keycode: number) {
      send({ type: 'key', action: 0, keycode });
      send({ type: 'key', action: 1, keycode });
    },
    backOrScreenOn() {
      send({ type: 'backOrScreenOn', action: 0 });
    },
  }));

  function send(msg: ControlMessage) {
    streamRef.current?.send(msg);
  }

  useEffect(() => {
    const canvas = canvasRef.current!;
    const stream = new DeviceStream(serial, {
      onReady: ({ device, mock }) => {
        mockRef.current = mock;
        if (device?.resolution) sizeRef.current = device.resolution;
        canvas.width = sizeRef.current.w;
        canvas.height = sizeRef.current.h;
        onStatus?.(mock ? '已连接 (MOCK 模式)' : '已连接，等待视频…');
        onLog?.(`ready: ${serial} mock=${mock}`);
      },
      onMockFrame: (f) => {
        sizeRef.current = { w: f.w, h: f.h };
        drawMock(canvas, serial, f);
      },
      onVideo: (frame) => {
        if (!decoderRef.current) {
          if (!H264Decoder.isSupported()) {
            onStatus?.('当前浏览器不支持 WebCodecs，无法解码 H264');
            return;
          }
          decoderRef.current = new H264Decoder(canvas);
        }
        decoderRef.current.decode(frame);
      },
      onError: (msg) => {
        onStatus?.(`错误: ${msg}`);
        onLog?.(`error: ${msg}`);
      },
      onClose: () => onStatus?.('连接已关闭'),
    });
    stream.connect();
    streamRef.current = stream;
    onStatus?.('连接中…');

    return () => {
      stream.close();
      decoderRef.current?.close();
      decoderRef.current = null;
      streamRef.current = null;
    };
  }, [serial]);

  // ---- 触摸映射 ----
  function toDevice(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * sizeRef.current.w;
    const y = ((clientY - rect.top) / rect.height) * sizeRef.current.h;
    return { x: Math.max(0, Math.min(sizeRef.current.w, x)), y: Math.max(0, Math.min(sizeRef.current.h, y)) };
  }

  function onPointer(action: TouchAction, e: React.PointerEvent) {
    const { x, y } = toDevice(e.clientX, e.clientY);
    send(touch(action, e.pointerId & 0xff, x, y, sizeRef.current.w, sizeRef.current.h));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // 特殊键 → keycode；可打印单字符 → text
    const map: Record<string, number> = {
      Enter: 66, Backspace: 67, Tab: 61,
      ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22,
    };
    if (map[e.key]) {
      e.preventDefault();
      const kc = map[e.key];
      send({ type: 'key', action: 0 as KeyAction, keycode: kc });
      send({ type: 'key', action: 1 as KeyAction, keycode: kc });
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      send({ type: 'text', text: e.key });
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="screen-canvas"
      tabIndex={0}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        canvasRef.current?.focus();
        onPointer(0, e);
      }}
      onPointerMove={(e) => e.buttons > 0 && onPointer(2, e)}
      onPointerUp={(e) => onPointer(1, e)}
      onPointerCancel={(e) => onPointer(1, e)}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
});

/** mock 模式：在 canvas 上自绘测试图案（移动方块 + 序号 + 时间戳 + 网格） */
function drawMock(
  canvas: HTMLCanvasElement,
  serial: string,
  f: { seq: number; ts: number; w: number; h: number },
) {
  if (canvas.width !== f.w) canvas.width = f.w;
  if (canvas.height !== f.h) canvas.height = f.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: W, height: H } = canvas;

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#11161f');
  g.addColorStop(1, '#0b0f16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(59,130,246,0.12)';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += W / 8) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += W / 8) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // 沿圆周运动的方块，证明帧在实时更新
  const t = f.seq / 60;
  const cx = W / 2 + Math.cos(t) * (W / 3);
  const cy = H / 2 + Math.sin(t) * (H / 3);
  const s = W / 8;
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(cx - s / 2, cy - s / 2, s, s);

  ctx.fillStyle = '#e6e8eb';
  ctx.font = `${Math.round(W / 22)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('MOCK STREAM', W / 2, H * 0.18);
  ctx.font = `${Math.round(W / 32)}px system-ui, sans-serif`;
  ctx.fillStyle = '#9aa0a6';
  ctx.fillText(serial, W / 2, H * 0.18 + W / 16);
  ctx.fillText(`seq ${f.seq}  ·  ${new Date(f.ts).toLocaleTimeString()}`, W / 2, H * 0.18 + W / 9);
  ctx.fillText(`${f.w}×${f.h}`, W / 2, H * 0.18 + W / 7);
}
