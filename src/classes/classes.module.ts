import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [RbacModule],
  controllers: [ClassesController],
  providers: [ClassesService],
})
export class ClassesModule {}
