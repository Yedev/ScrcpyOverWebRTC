import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';
import { StreamingModule } from './streaming/streaming.module';
import { SignalingModule } from './signaling/signaling.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    UsersModule,
    AuthModule,
    DevicesModule,
    StreamingModule,
    SignalingModule,
  ],
})
export class AppModule {}
