import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { auth } from '../auth/auth';
import { db } from '../db/db.module';
import { member, user } from '../db/schema';
import { LoginLinkInternalDto } from './internal.dto';
import { InternalTokenGuard } from './internal-token.guard';

@Controller('internal/auth')
@UseGuards(InternalTokenGuard)
export class InternalAuthController {
  @Post('login-link')
  async loginLink(@Body() dto: LoginLinkInternalDto) {
    const result = await db.transaction(async (tx) => {
      const [memberRow] = await tx
        .select()
        .from(member)
        .where(eq(member.telegramUserId, dto.telegramUserId))
        .for('update')
        .limit(1);

      if (!memberRow) {
        return { error: 'not_found' };
      }
      if (!memberRow.isActive) {
        return { error: 'inactive' };
      }
      if (!memberRow.telegramLinkedAt) {
        return { error: 'not_linked' };
      }

      if (memberRow.userId) {
        const [userRow] = await tx
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, memberRow.userId))
          .limit(1);
        return { email: userRow!.email! };
      }

      const newEmail = `tg${dto.telegramUserId}@sabbath.local`;
      const now = new Date();
      const [createdUser] = await tx
        .insert(user)
        .values({
          id: randomUUID(),
          email: newEmail,
          emailVerified: true,
          name: memberRow.fullName,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: user.id });

      await tx
        .update(member)
        .set({ userId: createdUser.id })
        .where(eq(member.id, memberRow.id));

      return { email: newEmail };
    });

    if ('error' in result) {
      return result;
    }

    await auth.api.signInMagicLink({
      body: { email: result.email },
      headers: new Headers(),
    });

    return { ok: true };
  }
}
