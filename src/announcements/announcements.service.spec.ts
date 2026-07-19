import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../db/db.module';
import { announcement } from '../db/schema';
import { AnnouncementsService } from './announcements.service';

describe('AnnouncementsService.claim (integration)', () => {
  const service = new AnnouncementsService(db);
  const ids: string[] = [];

  afterAll(async () => {
    for (const id of ids) {
      await db.delete(announcement).where(eq(announcement.id, id));
    }
  });

  it('re-claims an existing not-sent row instead of blocking forever', async () => {
    const [row] = await db
      .insert(announcement)
      .values({
        type: 'weekly_reminder',
        targetDate: '2099-01-03',
        chatId: 1,
        status: 'pending',
      })
      .returning();
    ids.push(row.id);

    const result = await service.claim({
      type: 'weekly_reminder',
      targetDate: '2099-01-03',
      chatId: 1,
    });

    expect(result).toEqual({ claimed: true, announcementId: row.id });
  });

  it('never re-sends an already-sent row', async () => {
    const [row] = await db
      .insert(announcement)
      .values({
        type: 'weekly_reminder',
        targetDate: '2099-01-10',
        chatId: 1,
        status: 'sent',
      })
      .returning();
    ids.push(row.id);

    const result = await service.claim({
      type: 'weekly_reminder',
      targetDate: '2099-01-10',
      chatId: 1,
    });

    expect(result).toEqual({ claimed: false, announcementId: row.id });
  });
});
