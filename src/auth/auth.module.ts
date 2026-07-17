import { Global, Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { MeController } from './me.controller';
import { SessionGuard } from './session.guard';

@Global()
@Module({
  imports: [RbacModule],
  controllers: [MeController],
  providers: [SessionGuard],
  exports: [SessionGuard],
})
export class AuthModule {}
