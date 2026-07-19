import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { AnnounceService } from './announce.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Controller('announcements')
@UseGuards(SessionGuard, PermissionGuard)
export class AnnouncementsController {
  constructor(private readonly announce: AnnounceService) {}

  @Post()
  @RequirePermissions('announcement.send')
  create(@Body() dto: CreateAnnouncementDto, @Req() req: AuthedRequest) {
    return this.announce.announceCustom(dto.text, req.member!.id);
  }

  @Post(':id/retry')
  @RequirePermissions('announcement.send')
  retry(@Param('id') id: string) {
    return this.announce.retry(id);
  }
}
