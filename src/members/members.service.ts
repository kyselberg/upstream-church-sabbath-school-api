import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../db/db.module';
import { member, telegramLinkToken } from '../db/schema';
import type { CreateMemberDto } from './dto/create-member.dto';
import type { UpdateMemberDto } from './dto/update-member.dto';

export const TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class MembersService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  findAll(activeOnly?: boolean) {
    return activeOnly
      ? this.db.select().from(member).where(eq(member.isActive, true))
      : this.db.select().from(member);
  }

  create(dto: CreateMemberDto) {
    return this.db
      .insert(member)
      .values(dto)
      .returning()
      .then(([row]) => row);
  }

  async update(id: string, dto: UpdateMemberDto) {
    const [row] = await this.db
      .update(member)
      .set(dto)
      .where(eq(member.id, id))
      .returning();
    if (!row) throw new NotFoundException('Member not found');
    return row;
  }

  async remove(id: string) {
    const [row] = await this.db
      .delete(member)
      .where(eq(member.id, id))
      .returning();
    if (!row) throw new NotFoundException('Member not found');
    return row;
  }

  async createTelegramToken(
    memberId: string,
    actorMemberId: string | undefined,
  ) {
    const [target] = await this.db
      .select()
      .from(member)
      .where(eq(member.id, memberId))
      .limit(1);
    if (!target) throw new NotFoundException('Member not found');

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.db.insert(telegramLinkToken).values({
      token,
      memberId,
      createdByMemberId: actorMemberId ?? null,
      expiresAt,
    });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? 'your_bot';
    return {
      token,
      deepLink: `https://t.me/${botUsername}?start=${token}`,
      expiresAt,
    };
  }
}
