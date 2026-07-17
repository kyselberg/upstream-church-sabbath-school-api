import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AgentLogService } from '../agent-log/agent-log.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { ScheduleService } from '../schedule/schedule.service';
import {
  AgentLogClaimDto,
  AgentLogFinishDto,
  LinkTelegramDto,
  MarkUnavailableInternalDto,
  ReassignInternalDto,
  RemindersClaimDto,
  RemindersSentDto,
  SubstituteInternalDto,
  SwapInternalDto,
  UndoInternalDto,
} from './internal.dto';
import { InternalTokenGuard } from './internal-token.guard';
import { InternalService } from './internal.service';

@Controller('internal')
@UseGuards(InternalTokenGuard)
export class InternalController {
  constructor(
    private readonly internal: InternalService,
    private readonly schedule: ScheduleService,
    private readonly announcements: AnnouncementsService,
    private readonly agentLog: AgentLogService,
  ) {}

  private async assignmentFor(classId: string, date: string) {
    const row = await this.schedule.getAssignment(classId, date);
    if (!row)
      throw new NotFoundException({
        code: 'not_found',
        message: 'Assignment not found',
      });
    return row;
  }

  @Get('members/resolve')
  resolveMember(@Query('q') q?: string) {
    return this.internal.resolveMember(q);
  }

  @Get('members/:id/active')
  activeMember(@Param('id') id: string) {
    return this.internal.activeMember(id);
  }

  @Get('members/:id/in-pool')
  inPool(@Param('id') id: string, @Query('classId') classId: string) {
    return this.internal.inPool(id, classId);
  }

  @Get('members/by-telegram/:tgUserId')
  byTelegram(@Param('tgUserId', ParseIntPipe) tgUserId: number) {
    return this.internal.byTelegram(tgUserId);
  }

  @Post('members/link-telegram')
  linkTelegram(@Body() dto: LinkTelegramDto) {
    return this.internal.linkTelegram(dto.token, dto.tgUserId, dto.tgUsername);
  }

  @Get('classes/resolve')
  resolveClass(@Query('q') q?: string) {
    return this.internal.resolveClass(q);
  }

  @Get('assignments')
  async getAssignment(
    @Query('classId') classId: string,
    @Query('date') date: string,
  ) {
    const row = await this.schedule.getAssignment(classId, date);
    return row ? { id: row.id, memberId: row.memberId } : null;
  }

  @Get('schedule/who')
  who(@Query('date') date: string) {
    return this.schedule.who(date);
  }

  @Get('schedule/upcoming')
  async upcoming(@Query('memberId') memberId?: string) {
    const rows = await this.schedule.listUpcoming(memberId);
    return rows.map((r) => ({
      date: r.date,
      className: r.className,
      presenter: r.memberName,
    }));
  }

  @Post('schedule/reassign')
  async reassign(@Body() dto: ReassignInternalDto) {
    const a = await this.assignmentFor(dto.classId, dto.date);
    return this.schedule.reassign(a.id, dto.toMemberId, {
      actorMemberId: dto.actorMemberId ?? null,
      source: 'telegram',
      canAssignAny: true,
    });
  }

  @Post('schedule/substitute')
  async substitute(@Body() dto: SubstituteInternalDto) {
    const a = await this.assignmentFor(dto.classId, dto.date);
    return this.schedule.substitute(a.id, dto.substituteMemberId, {
      actorMemberId: dto.actorMemberId ?? null,
      source: 'telegram',
      canAssignAny: true,
    });
  }

  @Post('schedule/swap')
  async swap(@Body() dto: SwapInternalDto) {
    const a = await this.assignmentFor(dto.a.classId, dto.a.date);
    const b = await this.assignmentFor(dto.b.classId, dto.b.date);
    return this.schedule.swap(a.id, b.id, {
      actorMemberId: dto.actorMemberId ?? null,
      source: 'telegram',
      canAssignAny: true,
    });
  }

  @Post('schedule/mark-unavailable')
  async markUnavailable(@Body() dto: MarkUnavailableInternalDto) {
    const a = await this.assignmentFor(dto.classId, dto.date);
    return this.schedule.markUnavailable(a.id, {
      actorMemberId: dto.actorMemberId ?? null,
      source: 'telegram',
      canAssignAny: true,
    });
  }

  @Post('schedule/undo')
  undo(@Body() dto: UndoInternalDto) {
    return this.schedule.undo(dto.ref, dto.byMemberId ?? null);
  }

  @Get('settings')
  settings() {
    return this.internal.settings();
  }

  @Post('agent-log/claim')
  claim(@Body() dto: AgentLogClaimDto) {
    return this.agentLog.claim(dto);
  }

  @Post('agent-log/finish')
  async finish(@Body() dto: AgentLogFinishDto) {
    await this.agentLog.finish(dto);
    return { ok: true };
  }

  @Post('reminders/claim')
  async remindersClaim(@Body() dto: RemindersClaimDto) {
    const settings = await this.internal.settings();
    return this.announcements.claim({
      type: dto.type,
      targetDate: dto.targetDate,
      chatId: settings.telegramGroupChatId ?? 0,
    });
  }

  @Get('reminders/data')
  remindersData(@Query('date') date: string) {
    return this.internal.remindersData(date);
  }

  @Post('reminders/:announcementId/sent')
  async remindersSent(
    @Param('announcementId') id: string,
    @Body() dto: RemindersSentDto,
  ) {
    const row = await this.announcements.markSent(id, dto.messageId);
    if (!row)
      throw new NotFoundException({
        code: 'not_found',
        message: 'Announcement not found',
      });
    return { ok: true };
  }
}
