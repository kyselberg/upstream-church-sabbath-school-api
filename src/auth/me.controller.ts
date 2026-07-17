import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { RbacService } from '../rbac/rbac.service';
import type { AuthedRequest } from './session.guard';
import { SessionGuard } from './session.guard';

@Controller()
export class MeController {
  constructor(private readonly rbac: RbacService) {}

  @Get('me')
  @UseGuards(SessionGuard)
  async me(@Req() req: AuthedRequest) {
    const permissions = req.member
      ? [...(await this.rbac.getMemberPermissions(req.member.id))]
      : [];

    return { user: req.user, member: req.member ?? null, permissions };
  }
}
