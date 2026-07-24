import { Module } from '@nestjs/common';
import { AgentLogModule } from '../agent-log/agent-log.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { RbacModule } from '../rbac/rbac.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { SubstitutionService } from '../substitution/substitution.service';
import { InternalAuthController } from './internal-auth.controller';
import { InternalController } from './internal.controller';
import { InternalTokenGuard } from './internal-token.guard';
import { InternalService } from './internal.service';

@Module({
  imports: [ScheduleModule, AnnouncementsModule, AgentLogModule, RbacModule],
  controllers: [InternalController, InternalAuthController],
  providers: [InternalService, InternalTokenGuard, SubstitutionService],
})
export class InternalModule {}
