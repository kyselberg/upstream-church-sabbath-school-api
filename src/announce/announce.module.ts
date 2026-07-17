import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AnnounceController } from './announce.controller';
import { AnnounceService } from './announce.service';
import { BotClient } from './bot.client';

@Module({
  imports: [RbacModule],
  controllers: [AnnounceController],
  providers: [BotClient, AnnounceService],
})
export class AnnounceModule {}
