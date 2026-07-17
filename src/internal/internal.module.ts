import { Module } from '@nestjs/common';
import { AgentLogModule } from '../agent-log/agent-log.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { InternalController } from './internal.controller';
import { InternalTokenGuard } from './internal-token.guard';
import { InternalService } from './internal.service';

@Module({
  imports: [ScheduleModule, AnnouncementsModule, AgentLogModule],
  controllers: [InternalController],
  providers: [InternalService, InternalTokenGuard],
})
export class InternalModule {}
