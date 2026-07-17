import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [RbacModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
