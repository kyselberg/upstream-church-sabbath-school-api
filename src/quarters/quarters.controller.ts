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
import { SessionGuard } from '../auth/session.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CreateQuarterDto } from './dto/create-quarter.dto';
import { UpdateQuarterDto } from './dto/update-quarter.dto';
import { QuartersService } from './quarters.service';

@Controller('quarters')
@UseGuards(SessionGuard, PermissionGuard)
export class QuartersController {
  constructor(private readonly quarters: QuartersService) {}

  @Get()
  @RequirePermissions('schedule.read')
  findAll() {
    return this.quarters.findAll();
  }

  @Post()
  @RequirePermissions('schedule.assign')
  create(@Body() dto: CreateQuarterDto) {
    return this.quarters.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('schedule.assign')
  update(@Param('id') id: string, @Body() dto: UpdateQuarterDto) {
    return this.quarters.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('schedule.assign')
  remove(@Param('id') id: string) {
    return this.quarters.remove(id);
  }

  @Post(':id/generate-saturdays')
  @RequirePermissions('schedule.assign')
  generateSaturdays(@Param('id') id: string) {
    return this.quarters.generateSaturdays(id);
  }
}
