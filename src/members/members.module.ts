import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [RbacModule],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
