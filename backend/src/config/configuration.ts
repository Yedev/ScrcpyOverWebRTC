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
  corsOrigin: string;
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
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
});
