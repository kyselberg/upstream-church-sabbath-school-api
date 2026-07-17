import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../db/db.module';
import { announcement } from '../db/schema';

export interface ClaimAnnouncementParams {
  type: (typeof announcement.$inferInsert)['type'];
  targetDate?: string | null;
  chatId: number;
  payload?: unknown;
  changeId?: string | null;
  swapGroupId?: string | null;
}

@Injectable()
export class AnnouncementsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async claim(params: ClaimAnnouncementParams) {
    const [inserted] = await this.db
      .insert(announcement)
      .values({
        type: params.type,
        targetDate: params.targetDate ?? null,
        chatId: params.chatId,
        payload: params.payload ?? null,
        changeId: params.changeId ?? null,
        swapGroupId: params.swapGroupId ?? null,
      })
      .onConflictDoNothing({
        target: [announcement.type, announcement.targetDate],
      })
      .returning({ id: announcement.id });

    if (inserted) {
      return { claimed: true, announcementId: inserted.id };
    }

    const targetDate = params.targetDate ?? null;
    const [existing] = await this.db
      .select({ id: announcement.id })
      .from(announcement)
      .where(
        and(
          eq(announcement.type, params.type),
          targetDate === null
            ? isNull(announcement.targetDate)
            : eq(announcement.targetDate, targetDate),
        ),
      )
      .limit(1);

    return { claimed: false, announcementId: existing?.id ?? null };
  }

  async markSent(id: string, messageId: number) {
    const [row] = await this.db
      .update(announcement)
      .set({ status: 'sent', messageId, sentAt: new Date() })
      .where(eq(announcement.id, id))
      .returning();
    return row ?? null;
  }
}
