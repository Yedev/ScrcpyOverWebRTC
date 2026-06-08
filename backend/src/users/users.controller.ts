import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  list() {
    return this.users.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(
      dto.username,
      dto.password,
      dto.role ?? 'user',
      dto.assignedDevices ?? [],
      dto.note ?? '',
    );
  }

  @Patch(':username')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('username') username: string, @Body() dto: UpdateUserDto) {
    return this.users.update(username, dto);
  }

  @Delete(':username')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('username') username: string) {
    return this.users.remove(username);
  }

  /** 任意已登录用户可改自己的密码 */
  @Patch('me/password')
  changeOwnPassword(@CurrentUser() me: AuthPrincipal, @Body('password') password: string) {
    return this.users.update(me.username, { password });
  }
}
