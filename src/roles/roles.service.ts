import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../db/db.module';
import { member, memberRole, permission, role } from '../db/schema';
import type { GrantRoleDto } from './dto/grant-role.dto';

@Injectable()
export class RolesService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  listRoles() {
    return this.db
      .select({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
      })
      .from(role);
  }

  listPermissions() {
    return this.db
      .select({
        id: permission.id,
        key: permission.key,
        description: permission.description,
      })
      .from(permission);
  }

  async memberRoles(memberId: string) {
    const [memberRow] = await this.db
      .select()
      .from(member)
      .where(eq(member.id, memberId))
      .limit(1);
    if (!memberRow)
      throw new NotFoundException({
        code: 'not_found',
        message: 'Member not found',
      });

    return this.db
      .select({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
      })
      .from(memberRole)
      .innerJoin(role, eq(role.id, memberRole.roleId))
      .where(eq(memberRole.memberId, memberId));
  }

  private async resolveRole(dto: GrantRoleDto) {
    if (dto.roleId) {
      const [row] = await this.db
        .select()
        .from(role)
        .where(eq(role.id, dto.roleId))
        .limit(1);
      return row ?? null;
    }
    if (dto.roleKey) {
      const [row] = await this.db
        .select()
        .from(role)
        .where(eq(role.key, dto.roleKey))
        .limit(1);
      return row ?? null;
    }
    return null;
  }

  async grant(memberId: string, dto: GrantRoleDto) {
    const [memberRow] = await this.db
      .select()
      .from(member)
      .where(eq(member.id, memberId))
      .limit(1);
    if (!memberRow)
      throw new NotFoundException({
        code: 'not_found',
        message: 'Member not found',
      });

    const roleRow = await this.resolveRole(dto);
    if (!roleRow)
      throw new NotFoundException({
        code: 'not_found',
        message: 'Role not found',
      });

    await this.db
      .insert(memberRole)
      .values({ memberId, roleId: roleRow.id })
      .onConflictDoNothing();

    return this.memberRoles(memberId);
  }

  async revoke(memberId: string, roleId: string) {
    const [row] = await this.db
      .delete(memberRole)
      .where(
        and(eq(memberRole.memberId, memberId), eq(memberRole.roleId, roleId)),
      )
      .returning();
    if (!row)
      throw new NotFoundException({
        code: 'not_found',
        message: 'Role assignment not found',
      });
    return { ok: true };
  }
}
