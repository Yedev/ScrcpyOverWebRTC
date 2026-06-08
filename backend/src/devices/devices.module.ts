import { Module } from '@nestjs/common';
import { AdbService } from './adb.service';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';

@Module({
  providers: [AdbService, DevicesService],
  controllers: [DevicesController],
  exports: [AdbService, DevicesService],
})
export class DevicesModule {}
