export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwt: { secret: string; expiresIn: string };
  adminPassword: string | null;
  bcryptRounds: number;
  allowPublicRegister: boolean;
  mockDevices: boolean;
  adbPath: string;
  scrcpyServerRemote: string;
  scrcpyServerLocal: string;
  scrcpyVersion: string;
  corsOrigin: string;
  /** P2P agent 接入信令服务器用的共享密钥 */
  agentKey: string;
  /** 下发给浏览器/agent 的 ICE 服务器（STUN/TURN） */
  iceServers: IceServer[];
}

export interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

function parseIceServers(): IceServer[] {
  const servers: IceServer[] = [];
  const stun = process.env.STUN_URL ?? 'stun:stun.l.google.com:19302';
  if (stun) servers.push({ urls: stun });
  const turnUrl = process.env.TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.TURN_USERNAME ?? '',
      credential: process.env.TURN_CREDENTIAL ?? '',
    });
  }
  return servers;
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-only-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  },
  adminPassword: process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD : null,
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10),
  allowPublicRegister: process.env.ALLOW_PUBLIC_REGISTER === 'true',
  mockDevices: process.env.MOCK_DEVICES !== 'false',
  adbPath: process.env.ADB_PATH ?? 'adb',
  scrcpyServerRemote: process.env.SCRCPY_SERVER_REMOTE ?? '/data/local/tmp/scrcpy-server.jar',
  scrcpyServerLocal: process.env.SCRCPY_SERVER_LOCAL ?? './assets/scrcpy-server.jar',
  scrcpyVersion: process.env.SCRCPY_VERSION ?? '2.4',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  agentKey: process.env.AGENT_KEY ?? 'dev-agent-key',
  iceServers: parseIceServers(),
});
