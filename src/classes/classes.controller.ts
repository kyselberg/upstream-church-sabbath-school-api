import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { ClassesService } from './classes.service';
import { AddTeacherDto } from './dto/add-teacher.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Controller('classes')
@UseGuards(SessionGuard, PermissionGuard)
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  @RequirePermissions('class.read')
  findAll() {
    return this.classes.findAll();
  }

  @Post()
  @RequirePermissions('class.manage')
  create(@Body() dto: CreateClassDto) {
    return this.classes.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('class.manage')
  update(@Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.classes.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('class.manage')
  remove(@Param('id') id: string) {
    return this.classes.remove(id);
  }

  @Get(':id/teachers')
  @RequirePermissions('class.read')
  listTeachers(@Param('id') id: string) {
    return this.classes.listTeachers(id);
  }

  @Post(':id/teachers')
  @RequirePermissions('class.manage')
  addTeacher(@Param('id') id: string, @Body() dto: AddTeacherDto) {
    return this.classes.addTeacher(id, dto);
  }

  @Delete(':id/teachers/:memberId')
  @RequirePermissions('class.manage')
  removeTeacher(@Param('id') id: string, @Param('memberId') memberId: string) {
    return this.classes.removeTeacher(id, memberId);
  }
}
