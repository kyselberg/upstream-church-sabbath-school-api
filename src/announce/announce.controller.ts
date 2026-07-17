import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import type { AuthedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { AnnounceService } from './announce.service';

class AnnounceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  changeId?: string;
}

@Controller('assignments')
@UseGuards(SessionGuard, PermissionGuard)
export class AnnounceController {
  constructor(private readonly announce: AnnounceService) {}

  @Post(':id/announce')
  @RequirePermissions('announcement.send')
  announceChange(
    @Param('id') id: string,
    @Body() dto: AnnounceDto,
    @Req() req: AuthedRequest,
  ) {
    return this.announce.announceChange(id, req.member!.id, dto.changeId);
  }
}
