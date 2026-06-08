/**
 * 浏览器 → 后端 的规范化控制指令（JSON）。
 * 后端再翻译成 scrcpy 二进制控制协议写回设备，从而把前端与 scrcpy 版本解耦。
 */
export type TouchAction = 0 | 1 | 2; // 0=DOWN 1=UP 2=MOVE (Android MotionEvent)
export type KeyAction = 0 | 1; // 0=DOWN 1=UP

export interface TouchMessage {
  type: 'touch';
  action: TouchAction;
  pointerId: number; // -1 表示鼠标
  x: number;
  y: number;
  w: number; // 参考屏宽
  h: number; // 参考屏高
  pressure?: number; // 0..1
}

export interface KeyMessage {
  type: 'key';
  action: KeyAction;
  keycode: number; // Android KeyEvent keycode
  metaState?: number;
  repeat?: number;
}

export interface ScrollMessage {
  type: 'scroll';
  x: number;
  y: number;
  w: number;
  h: number;
  hScroll: number; // -1..1
  vScroll: number; // -1..1
}

export interface TextMessage {
  type: 'text';
  text: string;
}

export interface BackOrScreenMessage {
  type: 'backOrScreenOn';
  action: KeyAction;
}

export interface SetOptionsMessage {
  type: 'setOptions';
  bitrate?: number;
  maxFps?: number;
  maxSize?: number;
}

export type ControlMessage =
  | TouchMessage
  | KeyMessage
  | ScrollMessage
  | TextMessage
  | BackOrScreenMessage
  | SetOptionsMessage;

export function parseControlMessage(raw: string): ControlMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (msg && typeof msg.type === 'string') return msg as ControlMessage;
    return null;
  } catch {
    return null;
  }
}
