import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../db/db.module';
import { RbacService } from '../rbac/rbac.service';
import {
  member,
  memberRole,
  permission,
  role,
  rolePermission,
} from '../db/schema';
import type { GrantRoleDto } from './dto/grant-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly rbac: RbacService,
  ) {}

  private async roleGrantsRoleManage(roleId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ key: permission.key })
      .from(rolePermission)
      .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
      .where(
        and(
          eq(rolePermission.roleId, roleId),
          eq(permission.key, 'role.manage'),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  private async assertActorCanManageRole(
    roleId: string,
    actorMemberId: string,
  ) {
    if (!(await this.roleGrantsRoleManage(roleId))) return;
    if (await this.rbac.hasRole(actorMemberId, 'superadmin')) return;
    throw new ForbiddenException({
      code: 'forbidden',
      message: 'Only superadmin manages role-managing roles',
    });
  }

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

  async grant(memberId: string, dto: GrantRoleDto, actorMemberId: string) {
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

    await this.assertActorCanManageRole(roleRow.id, actorMemberId);

    await this.db
      .insert(memberRole)
      .values({ memberId, roleId: roleRow.id })
      .onConflictDoNothing();

    return this.memberRoles(memberId);
  }

  async revoke(memberId: string, roleId: string, actorMemberId: string) {
    await this.assertActorCanManageRole(roleId, actorMemberId);

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
