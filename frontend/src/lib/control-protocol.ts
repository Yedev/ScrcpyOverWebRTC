/** 与后端 control-messages.ts 对齐的前端控制指令构造器 */
export type TouchAction = 0 | 1 | 2; // DOWN / UP / MOVE
export type KeyAction = 0 | 1;

export interface TouchMessage {
  type: 'touch';
  action: TouchAction;
  pointerId: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pressure?: number;
}
export interface KeyMessage {
  type: 'key';
  action: KeyAction;
  keycode: number;
  metaState?: number;
  repeat?: number;
}
export interface ScrollMessage {
  type: 'scroll';
  x: number;
  y: number;
  w: number;
  h: number;
  hScroll: number;
  vScroll: number;
}
export interface TextMessage {
  type: 'text';
  text: string;
}
export interface BackOrScreenMessage {
  type: 'backOrScreenOn';
  action: KeyAction;
}
export type ControlMessage =
  | TouchMessage
  | KeyMessage
  | ScrollMessage
  | TextMessage
  | BackOrScreenMessage;

// 常用 Android keycode
export const KEYCODE = {
  HOME: 3,
  BACK: 4,
  APP_SWITCH: 187,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  POWER: 26,
} as const;

export function touch(
  action: TouchAction,
  pointerId: number,
  x: number,
  y: number,
  w: number,
  h: number,
): TouchMessage {
  return { type: 'touch', action, pointerId, x: Math.round(x), y: Math.round(y), w, h };
}
