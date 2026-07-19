import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../db/db.module';
import {
  appSettings,
  assignment,
  classTeacher,
  klass,
  member,
  telegramLinkToken,
} from '../db/schema';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class InternalService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async resolveMember(q?: string) {
    if (!q) return null;

    if (q.startsWith('@')) {
      const [row] = await this.db
        .select({ id: member.id, fullName: member.fullName })
        .from(member)
        .where(eq(member.telegramUsername, q.slice(1)))
        .limit(1);
      return row ?? null;
    }

    if (UUID_RE.test(q)) {
      const [row] = await this.db
        .select({ id: member.id, fullName: member.fullName })
        .from(member)
        .where(eq(member.id, q))
        .limit(1);
      return row ?? null;
    }

    const [row] = await this.db
      .select({ id: member.id, fullName: member.fullName })
      .from(member)
      .where(
        or(
          ilike(member.fullName, `%${q}%`),
          ilike(member.displayName, `%${q}%`),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async activeMember(id: string) {
    const [row] = await this.db
      .select({ id: member.id, fullName: member.fullName })
      .from(member)
      .where(and(eq(member.id, id), eq(member.isActive, true)))
      .limit(1);
    return row ?? null;
  }

  async inPool(memberId: string, classId: string) {
    const [row] = await this.db
      .select()
      .from(classTeacher)
      .where(
        and(
          eq(classTeacher.memberId, memberId),
          eq(classTeacher.classId, classId),
        ),
      )
      .limit(1);
    return { inPool: !!row };
  }

  async byTelegram(tgUserId: number) {
    const [row] = await this.db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.telegramUserId, tgUserId))
      .limit(1);
    return row ? { memberId: row.id } : null;
  }

  async resolveClass(q?: string) {
    if (!q) return null;

    if (UUID_RE.test(q)) {
      const [row] = await this.db
        .select({ id: klass.id, name: klass.name })
        .from(klass)
        .where(eq(klass.id, q))
        .limit(1);
      return row ?? null;
    }

    const [row] = await this.db
      .select({ id: klass.id, name: klass.name })
      .from(klass)
      .where(ilike(klass.name, `%${q}%`))
      .limit(1);
    return row ?? null;
  }

  async settings() {
    const [row] = await this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .limit(1);
    if (!row)
      throw new NotFoundException({
        code: 'not_found',
        message: 'Settings not initialized',
      });

    return {
      llmProvider: row.llmProvider,
      llmModel: row.llmModel,
      llmApiKey: row.llmApiKey,
      llmBaseUrl: row.llmBaseUrl,
      botLocale: row.botLocale,
      undoWindowMinutes: row.undoWindowMinutes,
      timezone: row.timezone,
      reminderWeekday: row.reminderWeekday,
      reminderHour: row.reminderHour,
      reminderMinute: row.reminderMinute,
      telegramGroupChatId: row.telegramGroupChatId,
      pinWeekly: row.pinWeekly,
    };
  }

  async linkTelegram(token: string, tgUserId: number, tgUsername?: string) {
    return this.db.transaction(async (tx) => {
      const [tokenRow] = await tx
        .select()
        .from(telegramLinkToken)
        .where(eq(telegramLinkToken.token, token))
        .limit(1)
        .for('update');

      if (
        !tokenRow ||
        tokenRow.usedAt ||
        tokenRow.expiresAt.getTime() < Date.now()
      ) {
        return { error: 'invalid_token' };
      }

      const [conflict] = await tx
        .select({ id: member.id })
        .from(member)
        .where(eq(member.telegramUserId, tgUserId))
        .limit(1);
      if (conflict && conflict.id !== tokenRow.memberId) {
        return { error: 'telegram_already_linked' };
      }

      const now = new Date();
      let updated: { fullName: string } | undefined;
      try {
        [updated] = await tx
          .update(member)
          .set({
            telegramUserId: tgUserId,
            telegramUsername: tgUsername ?? null,
            telegramLinkedAt: now,
          })
          .where(eq(member.id, tokenRow.memberId))
          .returning({ fullName: member.fullName });
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          return { error: 'telegram_already_linked' };
        }
        throw err;
      }

      await tx
        .update(telegramLinkToken)
        .set({ usedAt: now })
        .where(eq(telegramLinkToken.id, tokenRow.id));

      return { ok: true as const, memberFullName: updated!.fullName };
    });
  }

  async remindersData(date: string) {
    const rows = await this.db
      .select({
        classId: klass.id,
        className: klass.name,
        memberId: member.id,
        fullName: member.fullName,
        telegramUserId: member.telegramUserId,
        telegramUsername: member.telegramUsername,
      })
      .from(klass)
      .leftJoin(
        assignment,
        and(eq(assignment.classId, klass.id), eq(assignment.date, date)),
      )
      .leftJoin(member, eq(member.id, assignment.memberId))
      .where(eq(klass.isActive, true))
      .orderBy(asc(klass.sortOrder));

    return rows.map((r) => ({
      classId: r.classId,
      className: r.className,
      presenter: r.memberId
        ? {
            memberId: r.memberId,
            fullName: r.fullName,
            telegramUserId: r.telegramUserId,
            telegramUsername: r.telegramUsername,
          }
        : null,
    }));
  }
}
