import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  date,
  jsonb,
  timestamp,
  unique,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const assignmentStatus = pgEnum('assignment_status', [
  'planned',
  'confirmed',
  'needs_substitute',
  'cancelled',
]);

export const changeType = pgEnum('change_type', [
  'assign',
  'reassign',
  'swap',
  'substitute',
  'unassign',
  'cancel',
]);

export const changeSource = pgEnum('change_source', [
  'web',
  'telegram',
  'system',
]);

export const announcementType = pgEnum('announcement_type', [
  'weekly_reminder',
  'change',
  'custom',
]);

export const announcementStatus = pgEnum('announcement_status', [
  'pending',
  'sent',
  'failed',
]);

export const agentStatus = pgEnum('agent_status', [
  'received',
  'applied',
  'rejected',
  'failed',
  'undone',
]);

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: tstz('created_at').defaultNow().notNull(),
  updatedAt: tstz('updated_at').defaultNow().notNull(),
});

export const member = pgTable(
  'member',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fullName: text('full_name').notNull(),
    displayName: text('display_name'),
    phone: text('phone'),
    telegramUserId: bigint('telegram_user_id', { mode: 'number' }),
    telegramUsername: text('telegram_username'),
    telegramLinkedAt: tstz('telegram_linked_at'),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: tstz('created_at').defaultNow().notNull(),
    updatedAt: tstz('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqTgUser: uniqueIndex('member_telegram_user_id_uq').on(t.telegramUserId),
    uniqUser: uniqueIndex('member_user_id_uq').on(t.userId),
    activeIdx: index('member_active_idx').on(t.isActive),
  }),
);

export const role = pgTable('role', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').default(false).notNull(),
  createdAt: tstz('created_at').defaultNow().notNull(),
});

export const permission = pgTable('permission', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  description: text('description'),
});

export const rolePermission = pgTable(
  'role_permission',
  {
    roleId: uuid('role_id')
      .references(() => role.id, { onDelete: 'cascade' })
      .notNull(),
    permissionId: uuid('permission_id')
      .references(() => permission.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.roleId, t.permissionId] }) }),
);

export const memberRole = pgTable(
  'member_role',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    memberId: uuid('member_id')
      .references(() => member.id, { onDelete: 'cascade' })
      .notNull(),
    roleId: uuid('role_id')
      .references(() => role.id, { onDelete: 'cascade' })
      .notNull(),
    scopeClassId: uuid('scope_class_id').references(() => klass.id, {
      onDelete: 'cascade',
    }),
    createdAt: tstz('created_at').defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('member_role_uq').on(
      t.memberId,
      t.roleId,
      t.scopeClassId,
    ),
    memberIdx: index('member_role_member_idx').on(t.memberId),
  }),
);

export const klass = pgTable('class', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: tstz('created_at').defaultNow().notNull(),
});

export const classTeacher = pgTable(
  'class_teacher',
  {
    classId: uuid('class_id')
      .references(() => klass.id, { onDelete: 'cascade' })
      .notNull(),
    memberId: uuid('member_id')
      .references(() => member.id, { onDelete: 'cascade' })
      .notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    addedAt: tstz('added_at').defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.classId, t.memberId] }) }),
);

export const quarter = pgTable('quarter', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: tstz('created_at').defaultNow().notNull(),
});

export const assignment = pgTable(
  'assignment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .references(() => klass.id, { onDelete: 'cascade' })
      .notNull(),
    date: date('date').notNull(),
    quarterId: uuid('quarter_id').references(() => quarter.id, {
      onDelete: 'set null',
    }),
    memberId: uuid('member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    originalMemberId: uuid('original_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    status: assignmentStatus('status').default('planned').notNull(),
    note: text('note'),
    createdAt: tstz('created_at').defaultNow().notNull(),
    updatedAt: tstz('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqClassDate: unique('assignment_class_date_uq').on(t.classId, t.date),
    dateIdx: index('assignment_date_idx').on(t.date),
    memberIdx: index('assignment_member_idx').on(t.memberId),
  }),
);

export const assignmentChange = pgTable(
  'assignment_change',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .references(() => assignment.id, { onDelete: 'cascade' })
      .notNull(),
    swapGroupId: uuid('swap_group_id'),
    type: changeType('type').notNull(),
    fromMemberId: uuid('from_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    toMemberId: uuid('to_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    actorMemberId: uuid('actor_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    source: changeSource('source').notNull(),
    reason: text('reason'),
    announced: boolean('announced').default(false).notNull(),
    prevState: jsonb('prev_state').$type<{
      memberId: string | null;
      originalMemberId: string | null;
      status: string;
    }>(),
    undoneAt: tstz('undone_at'),
    undoneByMemberId: uuid('undone_by_member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    createdAt: tstz('created_at').defaultNow().notNull(),
  },
  (t) => ({
    assignmentIdx: index('assignment_change_assignment_idx').on(t.assignmentId),
    swapIdx: index('assignment_change_swap_idx').on(t.swapGroupId),
    createdIdx: index('assignment_change_created_idx').on(t.createdAt),
  }),
);

export const telegramLinkToken = pgTable(
  'telegram_link_token',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    token: text('token').notNull().unique(),
    memberId: uuid('member_id')
      .references(() => member.id, { onDelete: 'cascade' })
      .notNull(),
    createdByMemberId: uuid('created_by_member_id').references(
      () => member.id,
      {
        onDelete: 'set null',
      },
    ),
    expiresAt: tstz('expires_at').notNull(),
    usedAt: tstz('used_at'),
    createdAt: tstz('created_at').defaultNow().notNull(),
  },
  (t) => ({
    memberIdx: index('telegram_link_token_member_idx').on(t.memberId),
  }),
);

export const announcement = pgTable(
  'announcement',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: announcementType('type').notNull(),
    targetDate: date('target_date'),
    chatId: bigint('chat_id', { mode: 'number' }).notNull(),
    messageId: bigint('message_id', { mode: 'number' }),
    payload: jsonb('payload'),
    status: announcementStatus('status').default('pending').notNull(),
    changeId: uuid('change_id').references(() => assignmentChange.id, {
      onDelete: 'set null',
    }),
    swapGroupId: uuid('swap_group_id'),
    createdAt: tstz('created_at').defaultNow().notNull(),
    sentAt: tstz('sent_at'),
  },
  (t) => ({
    uniqWeekly: uniqueIndex('announcement_type_date_uq').on(
      t.type,
      t.targetDate,
    ),
  }),
);

export const agentActionLog = pgTable(
  'agent_action_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    telegramUserId: bigint('telegram_user_id', { mode: 'number' }),
    memberId: uuid('member_id').references(() => member.id, {
      onDelete: 'set null',
    }),
    chatId: bigint('chat_id', { mode: 'number' }),
    updateId: bigint('update_id', { mode: 'number' }),
    messageText: text('message_text'),
    toolName: text('tool_name'),
    toolArgs: jsonb('tool_args'),
    result: jsonb('result'),
    status: agentStatus('status').default('received').notNull(),
    changeId: uuid('change_id').references(() => assignmentChange.id, {
      onDelete: 'set null',
    }),
    createdAt: tstz('created_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqUpdate: uniqueIndex('agent_action_log_update_uq').on(t.updateId),
    memberIdx: index('agent_action_log_member_idx').on(t.memberId),
  }),
);

export const appSettings = pgTable('app_settings', {
  id: integer('id').primaryKey().default(1),
  telegramGroupChatId: bigint('telegram_group_chat_id', { mode: 'number' }),
  timezone: text('timezone').default('Europe/Kyiv').notNull(),
  reminderWeekday: integer('reminder_weekday').default(3).notNull(),
  reminderHour: integer('reminder_hour').default(9).notNull(),
  reminderMinute: integer('reminder_minute').default(0).notNull(),
  pinWeekly: boolean('pin_weekly').default(true).notNull(),
  undoWindowMinutes: integer('undo_window_minutes').default(30).notNull(),
  llmModel: text('llm_model').default('anthropic:claude-sonnet-4-6').notNull(),
  botLocale: text('bot_locale').default('uk').notNull(),
  updatedAt: tstz('updated_at').defaultNow().notNull(),
});

export * from './auth-schema';
