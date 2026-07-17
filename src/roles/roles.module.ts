import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [RbacModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
