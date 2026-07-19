import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(SessionGuard, PermissionGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions('settings.manage')
  async get() {
    const { llmApiKey, ...rest } = await this.settings.get();
    return { ...rest, llmApiKeySet: !!llmApiKey };
  }

  @Patch()
  @RequirePermissions('settings.manage')
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }
}
