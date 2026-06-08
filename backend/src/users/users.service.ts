import { Injectable, Logger, OnModuleInit, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { promises as fs } from 'fs';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { AppConfig } from '../config/configuration';
import { User, UserRole, SafeUser, toSafeUser } from './user.model';

/**
 * 基于 JSON 文件的用户仓库。刻意用最简单的持久化以便开箱即跑；
 * 接口边界清晰，后续可无痛替换为 TypeORM / Prisma。
 */
@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private readonly dataDir = join(process.cwd(), 'data');
  private readonly dataFile = join(this.dataDir, 'users.json');
  private users = new Map<string, User>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async onModuleInit() {
    await this.load();
    await this.seedAdmin();
  }

  private async load() {
    try {
      const raw = await fs.readFile(this.dataFile, 'utf-8');
      const arr: User[] = JSON.parse(raw);
      this.users = new Map(arr.map((u) => [u.username, u]));
      this.logger.log(`Loaded ${this.users.size} user(s) from ${this.dataFile}`);
    } catch {
      this.users = new Map();
    }
  }

  private async persist() {
    await fs.mkdir(this.dataDir, { recursive: true });
    const arr = [...this.users.values()];
    await fs.writeFile(this.dataFile, JSON.stringify(arr, null, 2), { mode: 0o600 });
  }

  /**
   * 首启播种管理员。改进点：不再硬编码 admin/admin123。
   * 密码取自 ADMIN_PASSWORD；未设置则随机生成并打印一次（之后只存哈希）。
   */
  private async seedAdmin() {
    if (this.users.has('admin')) return;
    let password = this.config.get('adminPassword', { infer: true });
    let generated = false;
    if (!password) {
      password = randomBytes(9).toString('base64url'); // ~12 字符强随机
      generated = true;
    }
    await this.create('admin', password, 'admin', ['*'], 'default administrator');
    if (generated) {
      this.logger.warn('========================================================');
      this.logger.warn(`  初始管理员已创建  ->  用户名: admin  密码: ${password}`);
      this.logger.warn('  该密码仅打印此一次，请立即登录并修改。');
      this.logger.warn('========================================================');
    } else {
      this.logger.log('初始管理员 "admin" 已用 ADMIN_PASSWORD 创建。');
    }
  }

  async findByUsername(username: string): Promise<User | undefined> {
    return this.users.get(username);
  }

  findAll(): SafeUser[] {
    return [...this.users.values()].map(toSafeUser);
  }

  async create(
    username: string,
    password: string,
    role: UserRole = 'user',
    assignedDevices: string[] = [],
    note = '',
  ): Promise<SafeUser> {
    if (this.users.has(username)) {
      throw new ConflictException(`用户已存在: ${username}`);
    }
    const rounds = this.config.get('bcryptRounds', { infer: true });
    const user: User = {
      username,
      passwordHash: await bcrypt.hash(password, rounds),
      role,
      assignedDevices,
      note,
      createdAt: new Date().toISOString(),
    };
    this.users.set(username, user);
    await this.persist();
    return toSafeUser(user);
  }

  async update(
    username: string,
    patch: Partial<Pick<User, 'role' | 'assignedDevices' | 'note'>> & { password?: string },
  ): Promise<SafeUser> {
    const user = this.users.get(username);
    if (!user) throw new NotFoundException(`用户不存在: ${username}`);
    if (patch.role) user.role = patch.role;
    if (patch.assignedDevices) user.assignedDevices = patch.assignedDevices;
    if (patch.note !== undefined) user.note = patch.note;
    if (patch.password) {
      const rounds = this.config.get('bcryptRounds', { infer: true });
      user.passwordHash = await bcrypt.hash(patch.password, rounds);
    }
    await this.persist();
    return toSafeUser(user);
  }

  async remove(username: string): Promise<void> {
    if (username === 'admin') {
      throw new ConflictException('不能删除内置 admin 账户');
    }
    if (!this.users.delete(username)) {
      throw new NotFoundException(`用户不存在: ${username}`);
    }
    await this.persist();
  }

  async validate(username: string, password: string): Promise<User | null> {
    const user = this.users.get(username);
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }
}
