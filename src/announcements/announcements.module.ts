import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';

@Module({
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
