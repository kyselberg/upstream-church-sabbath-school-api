import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../db/db.module';
import { session } from '../db/auth-schema';
import { member, telegramLinkToken, user } from '../db/schema';
import { RbacService } from '../rbac/rbac.service';
import type { CreateMemberDto } from './dto/create-member.dto';
import type { UpdateMemberDto } from './dto/update-member.dto';

export const TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class MembersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly rbacService: RbacService,
  ) {}

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

  private async assertCanManageTarget(
    actorMemberId: string | undefined,
    targetMemberId: string,
  ) {
    if (actorMemberId !== undefined && actorMemberId === targetMemberId) {
      return;
    }

    const targetIsPrivileged =
      (await this.rbacService.hasRole(targetMemberId, 'admin')) ||
      (await this.rbacService.hasRole(targetMemberId, 'superadmin'));
    if (!targetIsPrivileged) return;

    const actorIsSuperadmin =
      actorMemberId !== undefined &&
      (await this.rbacService.hasRole(actorMemberId, 'superadmin'));
    if (!actorIsSuperadmin) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'Недостатньо прав для цього учасника',
      });
    }
  }

  async update(id: string, dto: UpdateMemberDto, actorMemberId?: string) {
    await this.assertCanManageTarget(actorMemberId, id);

    const [row] = await this.db
      .update(member)
      .set(dto)
      .where(eq(member.id, id))
      .returning();
    if (!row) throw new NotFoundException('Member not found');
    if (dto.isActive === false && row.userId) {
      await this.db.delete(session).where(eq(session.userId, row.userId));
    }
    return row;
  }

  async remove(id: string, actorMemberId?: string) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(member)
        .where(eq(member.id, id))
        .limit(1);
      if (!row) throw new NotFoundException('Member not found');

      if (await this.rbacService.hasRole(id, 'superadmin')) {
        throw new UnprocessableEntityException({
          code: 'cannot_delete_superadmin',
          message:
            'Не можна видалити суперадміна — спершу зніми роль або заархівуй.',
        });
      }

      await this.assertCanManageTarget(actorMemberId, id);

      const [deleted] = await tx
        .delete(member)
        .where(eq(member.id, id))
        .returning();
      if (row.userId) {
        await tx.delete(user).where(eq(user.id, row.userId));
      }
      return deleted;
    });
  }

  async createTelegramToken(
    memberId: string,
    actorMemberId: string | undefined,
  ) {
    await this.assertCanManageTarget(actorMemberId, memberId);

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

  async unlinkTelegram(id: string, actorMemberId?: string) {
    await this.assertCanManageTarget(actorMemberId, id);

    const [row] = await this.db
      .update(member)
      .set({
        telegramUserId: null,
        telegramUsername: null,
        telegramLinkedAt: null,
      })
      .where(eq(member.id, id))
      .returning();
    if (!row) throw new NotFoundException('Member not found');
    if (row.userId) {
      await this.db.delete(session).where(eq(session.userId, row.userId));
    }
    return row;
  }
}
