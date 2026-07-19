import {
  BadRequestException,
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
    if (change.announced) {
      return { ok: true, messageId: null };
    }

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
      payload: { text, undoRef },
      status: result.ok ? 'sent' : 'failed',
      messageId: result.ok ? (result.messageId ?? null) : null,
      sentAt: result.ok ? new Date() : null,
    });

    if (result.ok) {
      await this.db
        .update(assignmentChange)
        .set({ announced: true })
        .where(eq(assignmentChange.id, change.id));
    }

    return {
      ok: result.ok,
      messageId: result.ok ? (result.messageId ?? null) : null,
    };
  }

  async announceCustom(text: string, _actorMemberId: string | null) {
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

    const clean = text.trim();
    if (!clean) {
      throw new BadRequestException({
        code: 'empty',
        message: 'Text required',
      });
    }

    const result = await this.bot.announce({
      chatId: settings.telegramGroupChatId,
      text: clean,
      undoRef: null,
      undoWindowMinutes: settings.undoWindowMinutes,
    });

    const [row] = await this.db
      .insert(announcement)
      .values({
        type: 'custom',
        chatId: settings.telegramGroupChatId,
        payload: { text: clean },
        status: result.ok ? 'sent' : 'failed',
        messageId: result.ok ? (result.messageId ?? null) : null,
        sentAt: result.ok ? new Date() : null,
      })
      .returning({ id: announcement.id });

    return { ok: result.ok, id: row.id };
  }

  async retry(announcementId: string) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(announcement)
        .where(eq(announcement.id, announcementId))
        .for('update')
        .limit(1);
      if (!row) {
        throw new NotFoundException({
          code: 'not_found',
          message: 'Announcement not found',
        });
      }
      if (row.status === 'sent') {
        return { ok: true };
      }

      const text = (row.payload as any)?.text as string | undefined;
      if (!text) {
        // ponytail: only announcements created after the payload change are
        // retryable; a fresh app has ~none legacy without stored text.
        throw new UnprocessableEntityException({
          code: 'cannot_retry',
          message: 'No stored text to resend',
        });
      }
      const undoRef = (row.payload as any)?.undoRef ?? null;

      const [settings] = await tx
        .select()
        .from(appSettings)
        .where(eq(appSettings.id, 1))
        .limit(1);

      const result = await this.bot.announce({
        chatId: row.chatId,
        text,
        undoRef,
        undoWindowMinutes: settings?.undoWindowMinutes ?? 30,
      });

      await tx
        .update(announcement)
        .set({
          status: result.ok ? 'sent' : 'failed',
          messageId: result.ok ? (result.messageId ?? null) : row.messageId,
          sentAt: result.ok ? new Date() : row.sentAt,
        })
        .where(eq(announcement.id, announcementId));

      return { ok: result.ok };
    });
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
