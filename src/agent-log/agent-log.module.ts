import { Module } from '@nestjs/common';
import { AgentLogService } from './agent-log.service';

@Module({
  providers: [AgentLogService],
  exports: [AgentLogService],
})
export class AgentLogModule {}
