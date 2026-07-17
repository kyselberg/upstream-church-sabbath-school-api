import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { auth } from './auth';
import { db } from '../db/db.module';
import { member } from '../db/schema';

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export interface AuthedRequest extends Request {
  session?: Session['session'];
  user?: Session['user'];
  member?: typeof member.$inferSelect | null;
}

@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const result = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!result) {
      throw new UnauthorizedException({
        code: 'unauthorized',
        message: 'Not authenticated',
      });
    }

    const [memberRow] = await db
      .select()
      .from(member)
      .where(eq(member.userId, result.user.id))
      .limit(1);

    req.session = result.session;
    req.user = result.user;
    req.member = memberRow ?? null;

    return true;
  }
}
