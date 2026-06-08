import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { AdbService } from './adb.service';
import { DeviceInfo } from './device.model';
import { canAccessDevice } from '../users/user.model';
import { AuthPrincipal } from '../auth/jwt.strategy';

@Injectable()
export class DevicesService implements OnModuleInit {
  private readonly logger = new Logger(DevicesService.name);
  private readonly mock: boolean;
  private registry = new Map<string, DeviceInfo>();

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly adb: AdbService,
  ) {
    this.mock = config.get('mockDevices', { infer: true });
  }

  async onModuleInit() {
    await this.refresh();
  }

  /** 刷新设备列表：mock 模式注入虚拟设备，否则从 adb 拉取并补充属性 */
  async refresh(): Promise<DeviceInfo[]> {
    if (this.mock) {
      this.injectMockDevices();
      return [...this.registry.values()];
    }
    const found = await this.adb.listDevices();
    const next = new Map<string, DeviceInfo>();
    for (const dev of found) {
      if (dev.status === 'online') {
        try {
          dev.androidVersion = await this.adb.getProp(dev.serial, 'ro.build.version.release');
          const size = await this.adb.getProp(dev.serial, 'sys.display-size').catch(() => '');
          const m = /(\d+)x(\d+)/.exec(size);
          if (m) dev.resolution = { width: +m[1], height: +m[2] };
        } catch (e) {
          this.logger.warn(`probe ${dev.serial} failed: ${(e as Error).message}`);
        }
      }
      next.set(dev.serial, dev);
    }
    this.registry = next;
    return [...this.registry.values()];
  }

  private injectMockDevices() {
    if (this.registry.size > 0) return;
    const mocks: DeviceInfo[] = [
      {
        serial: 'mock-pixel-7',
        name: 'Mock Pixel 7',
        model: 'Pixel 7',
        androidVersion: '14',
        resolution: { width: 1080, height: 2400 },
        status: 'online',
        mock: true,
        lastSeen: new Date().toISOString(),
      },
      {
        serial: 'mock-redroid-01',
        name: 'Mock Redroid 01',
        model: 'redroid',
        androidVersion: '13',
        resolution: { width: 720, height: 1280 },
        status: 'online',
        mock: true,
        lastSeen: new Date().toISOString(),
      },
    ];
    mocks.forEach((d) => this.registry.set(d.serial, d));
    this.logger.warn(`Injected ${mocks.length} mock device(s).`);
  }

  listForUser(user: AuthPrincipal): DeviceInfo[] {
    return [...this.registry.values()].filter((d) => canAccessDevice(user, d.serial));
  }

  getForUser(user: AuthPrincipal, serial: string): DeviceInfo {
    const dev = this.registry.get(serial);
    if (!dev || !canAccessDevice(user, serial)) {
      throw new NotFoundException(`设备不存在或无权访问: ${serial}`);
    }
    return dev;
  }

  isMock(serial: string): boolean {
    return !!this.registry.get(serial)?.mock || this.mock;
  }
}
