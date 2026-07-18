import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentLogModule } from './agent-log/agent-log.module';
import { AnnounceModule } from './announce/announce.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AuthModule } from './auth/auth.module';
import { ClassesModule } from './classes/classes.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { InternalModule } from './internal/internal.module';
import { MembersModule } from './members/members.module';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { QuartersModule } from './quarters/quarters.module';
import { RbacModule } from './rbac/rbac.module';
import { RolesModule } from './roles/roles.module';
import { ScheduleModule } from './schedule/schedule.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    HealthModule,
    AuthModule,
    RbacModule,
    MembersModule,
    RolesModule,
    ClassesModule,
    QuartersModule,
    SettingsModule,
    ScheduleModule,
    AnnouncementsModule,
    AgentLogModule,
    InternalModule,
    AnnounceModule,
  ],
  controllers: [MetricsController],
  providers: [MetricsInterceptor],
})
export class AppModule {}
