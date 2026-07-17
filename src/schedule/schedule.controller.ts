import {
  Body,
  Controller,
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
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { RbacService } from '../rbac/rbac.service';
import { ReassignDto } from './dto/reassign.dto';
import { SubstituteDto } from './dto/substitute.dto';
import { SwapDto } from './dto/swap.dto';
import { UndoDto } from './dto/undo.dto';
import { ScheduleService } from './schedule.service';

@Controller()
@UseGuards(SessionGuard, PermissionGuard)
export class ScheduleController {
  constructor(
    private readonly schedule: ScheduleService,
    private readonly rbac: RbacService,
  ) {}

  private async canAssignAny(memberId: string): Promise<boolean> {
    if (await this.rbac.hasRole(memberId, 'superadmin')) return true;
    const perms = await this.rbac.getMemberPermissions(memberId);
    return perms.has('schedule.assign');
  }

  @Get('assignments')
  @RequirePermissions('schedule.read')
  listAssignments(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
  ) {
    return this.schedule.listAssignments({ from, to, classId });
  }

  @Patch('assignments/:id')
  @RequirePermissions('schedule.assign.own')
  async reassign(
    @Param('id') id: string,
    @Body() dto: ReassignDto,
    @Req() req: AuthedRequest,
  ) {
    return this.schedule.reassign(id, dto.toMemberId, {
      actorMemberId: req.member!.id,
      source: 'web',
      canAssignAny: await this.canAssignAny(req.member!.id),
    });
  }

  @Post('assignments/:id/substitute')
  @RequirePermissions('schedule.assign.own')
  async substitute(
    @Param('id') id: string,
    @Body() dto: SubstituteDto,
    @Req() req: AuthedRequest,
  ) {
    return this.schedule.substitute(id, dto.substituteMemberId, {
      actorMemberId: req.member!.id,
      source: 'web',
      canAssignAny: await this.canAssignAny(req.member!.id),
    });
  }

  @Post('swaps')
  @RequirePermissions('swap.propose')
  async swap(@Body() dto: SwapDto, @Req() req: AuthedRequest) {
    return this.schedule.swap(dto.aId, dto.bId, {
      actorMemberId: req.member!.id,
      source: 'web',
      canAssignAny: await this.canAssignAny(req.member!.id),
    });
  }

  @Post('assignments/:id/mark-unavailable')
  @RequirePermissions('schedule.assign.own')
  async markUnavailable(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.schedule.markUnavailable(id, {
      actorMemberId: req.member!.id,
      source: 'web',
      canAssignAny: await this.canAssignAny(req.member!.id),
    });
  }

  @Post('undo')
  @RequirePermissions('schedule.assign')
  undo(@Body() dto: UndoDto, @Req() req: AuthedRequest) {
    return this.schedule.undo(dto.ref, req.member!.id);
  }

  @Get('activity')
  @RequirePermissions('schedule.read')
  activity(@Query('from') from?: string, @Query('to') to?: string) {
    return this.schedule.listActivity(from, to);
  }
}
