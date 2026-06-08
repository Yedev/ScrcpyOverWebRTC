export type DeviceStatus = 'online' | 'offline' | 'unauthorized';

export interface DeviceInfo {
  serial: string;
  name: string;
  model?: string;
  androidVersion?: string;
  resolution?: { width: number; height: number };
  status: DeviceStatus;
  mock?: boolean;
  lastSeen: string;
}

export interface AuthUser {
  username: string;
  role: 'admin' | 'user';
  assignedDevices: string[];
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}
