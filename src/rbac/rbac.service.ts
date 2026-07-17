import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/db.module';
import { memberRole, permission, role, rolePermission } from '../db/schema';

@Injectable()
export class RbacService {
  async getMemberPermissions(memberId: string): Promise<Set<string>> {
    const rows = await db
      .select({ key: permission.key })
      .from(memberRole)
      .innerJoin(rolePermission, eq(rolePermission.roleId, memberRole.roleId))
      .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
      .where(eq(memberRole.memberId, memberId));

    return new Set(rows.map((r) => r.key));
  }

  async hasRole(memberId: string, key: string): Promise<boolean> {
    const [row] = await db
      .select({ id: role.id })
      .from(memberRole)
      .innerJoin(role, eq(role.id, memberRole.roleId))
      .where(and(eq(memberRole.memberId, memberId), eq(role.key, key)))
      .limit(1);

    return Boolean(row);
  }
}
