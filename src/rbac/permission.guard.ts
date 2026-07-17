import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from '../auth/session.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { RbacService } from './rbac.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.get<string[]>(PERMISSIONS_KEY, context.getHandler()) ?? [];
    if (required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const memberId = req.member?.id;
    if (!memberId) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'No member linked to session',
      });
    }

    if (await this.rbac.hasRole(memberId, 'superadmin')) return true;

    const granted = await this.rbac.getMemberPermissions(memberId);
    const ok = required.every(
      (key) =>
        granted.has(key) ||
        (key === 'schedule.assign.own' && granted.has('schedule.assign')),
    );
    if (!ok) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'Missing permission',
      });
    }

    return true;
  }
}
