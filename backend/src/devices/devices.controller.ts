import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { DevicesService } from './devices.service';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@CurrentUser() user: AuthPrincipal) {
    return this.devices.listForUser(user);
  }

  @Post('refresh')
  async refresh(@CurrentUser() user: AuthPrincipal) {
    await this.devices.refresh();
    return this.devices.listForUser(user);
  }

  @Get(':serial')
  get(@CurrentUser() user: AuthPrincipal, @Param('serial') serial: string) {
    return this.devices.getForUser(user, serial);
  }
}
