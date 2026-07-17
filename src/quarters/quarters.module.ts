import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { QuartersController } from './quarters.controller';
import { QuartersService } from './quarters.service';

@Module({
  imports: [RbacModule],
  controllers: [QuartersController],
  providers: [QuartersService],
})
export class QuartersModule {}
