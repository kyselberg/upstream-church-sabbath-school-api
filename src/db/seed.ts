import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { permission, role, rolePermission, appSettings, klass } from './schema';

const PERMISSIONS = [
  'member.read',
  'member.manage',
  'class.read',
  'class.manage',
  'schedule.read',
  'schedule.assign',
  'schedule.assign.own',
  'swap.propose',
  'swap.approve',
  'announcement.send',
  'role.manage',
  'settings.manage',
  'telegram.link',
  'telegram.link.self',
] as const;

const TEACHER_PERMISSIONS = [
  'schedule.read',
  'schedule.assign.own',
  'swap.propose',
  'member.read',
  'class.read',
  'telegram.link.self',
];

const ADMIN_PERMISSIONS = [
  ...TEACHER_PERMISSIONS,
  'member.manage',
  'class.manage',
  'schedule.assign',
  'swap.approve',
  'announcement.send',
  'telegram.link',
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  teacher: TEACHER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  superadmin: [...PERMISSIONS],
};

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
  });
  const db = drizzle(pool);

  await db
    .insert(permission)
    .values(PERMISSIONS.map((key) => ({ key })))
    .onConflictDoNothing();

  await db
    .insert(role)
    .values([
      { key: 'superadmin', name: 'Superadmin', isSystem: true },
      { key: 'admin', name: 'Admin', isSystem: true },
      { key: 'teacher', name: 'Teacher', isSystem: true },
    ])
    .onConflictDoNothing();

  const roles = await db.select().from(role);
  const permissions = await db.select().from(permission);
  const permissionIdByKey = new Map(permissions.map((p) => [p.key, p.id]));

  const rolePermissionRows = roles.flatMap((r) => {
    const keys = ROLE_PERMISSIONS[r.key] ?? [];
    return keys.map((key) => ({
      roleId: r.id,
      permissionId: permissionIdByKey.get(key)!,
    }));
  });

  if (rolePermissionRows.length > 0) {
    await db
      .insert(rolePermission)
      .values(rolePermissionRows)
      .onConflictDoNothing();
  }

  await db.insert(appSettings).values({}).onConflictDoNothing();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(klass);
  if (count === 0) {
    await db.insert(klass).values(
      Array.from({ length: 4 }, (_, i) => ({
        name: `Клас ${i + 1}`,
        sortOrder: i + 1,
      })),
    );
  }

  await pool.end();
}

main()
  .then(() => {
    console.log('Seed complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
