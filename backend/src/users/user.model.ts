export type UserRole = 'admin' | 'user';

export interface User {
  username: string;
  passwordHash: string;
  role: UserRole;
  /** 设备 serial 白名单；['*'] 表示全部设备 */
  assignedDevices: string[];
  note?: string;
  createdAt: string;
}

/** 对外返回（永远不含 passwordHash） */
export type SafeUser = Omit<User, 'passwordHash'>;

export function toSafeUser(user: User): SafeUser {
  const { passwordHash, ...safe } = user;
  return safe;
}

export function canAccessDevice(user: Pick<User, 'role' | 'assignedDevices'>, serial: string): boolean {
  if (user.role === 'admin') return true;
  return user.assignedDevices.includes('*') || user.assignedDevices.includes(serial);
}
