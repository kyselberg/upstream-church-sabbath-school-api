import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../db/db.module';
import {
  announcement,
  appSettings,
  assignment,
  assignmentChange,
  klass,
  member,
} from '../db/schema';
import { BotClient } from './bot.client';

@Injectable()
export class AnnounceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly bot: BotClient,
  ) {}

  async announceChange(
    assignmentId: string,
    actorMemberId: string | null,
    changeId?: string,
  ) {
    const change = await this.findChange(assignmentId, changeId);
    if (!change)
      throw new NotFoundException({
        code: 'not_found',
        message: 'Change not found',
      });

    const [a] = await this.db
      .select({ date: assignment.date, className: klass.name })
      .from(assignment)
      .innerJoin(klass, eq(klass.id, assignment.classId))
      .where(eq(assignment.id, assignmentId))
      .limit(1);
    if (!a)
      throw new NotFoundException({
        code: 'not_found',
        message: 'Assignment not found',
      });

    const [settings] = await this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .limit(1);
    if (!settings?.telegramGroupChatId) {
      throw new UnprocessableEntityException({
        code: 'no_group',
        message: 'Telegram group not configured',
      });
    }

    const fromName = await this.memberName(change.fromMemberId);
    const toName = await this.memberName(change.toMemberId);
    const text = `Зміна: ${a.className} ${a.date} — ${fromName} → ${toName}`;
    const undoRef = change.swapGroupId
      ? `swap:${change.swapGroupId}`
      : `change:${change.id}`;

    const result = await this.bot.announce({
      chatId: settings.telegramGroupChatId,
      text,
      undoRef,
      undoWindowMinutes: settings.undoWindowMinutes,
    });

    await this.db.insert(announcement).values({
      type: 'change',
      chatId: settings.telegramGroupChatId,
      changeId: change.id,
      swapGroupId: change.swapGroupId,
      status: result.ok ? 'sent' : 'failed',
      messageId: result.ok ? (result.messageId ?? null) : null,
      sentAt: result.ok ? new Date() : null,
    });

    await this.db
      .update(assignmentChange)
      .set({ announced: true })
      .where(eq(assignmentChange.id, change.id));

    return {
      ok: result.ok,
      messageId: result.ok ? (result.messageId ?? null) : null,
    };
  }

  private async memberName(memberId: string | null) {
    if (!memberId) return 'вільно';
    const [row] = await this.db
      .select({ fullName: member.fullName })
      .from(member)
      .where(eq(member.id, memberId))
      .limit(1);
    return row?.fullName ?? 'вільно';
  }

  private async findChange(assignmentId: string, changeId?: string) {
    if (changeId) {
      const [row] = await this.db
        .select()
        .from(assignmentChange)
        .where(eq(assignmentChange.id, changeId))
        .limit(1);
      return row ?? null;
    }

    const [row] = await this.db
      .select()
      .from(assignmentChange)
      .where(
        and(
          eq(assignmentChange.assignmentId, assignmentId),
          isNull(assignmentChange.undoneAt),
        ),
      )
      .orderBy(desc(assignmentChange.createdAt))
      .limit(1);
    return row ?? null;
  }
}
