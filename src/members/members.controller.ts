import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PermissionGuard } from '../rbac/permission.guard';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MembersService } from './members.service';

@Controller('members')
@UseGuards(SessionGuard, PermissionGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermissions('member.read')
  findAll(@Query('active') active?: string) {
    return this.members.findAll(active === 'true');
  }

  @Post()
  @RequirePermissions('member.manage')
  create(@Body() dto: CreateMemberDto) {
    return this.members.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('member.manage')
  update(@Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.members.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('member.manage')
  remove(@Param('id') id: string) {
    return this.members.remove(id);
  }

  @Post(':id/telegram-token')
  @RequirePermissions('telegram.link')
  createTelegramToken(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.members.createTelegramToken(id, req.member?.id);
  }
}
