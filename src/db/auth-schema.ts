import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './schema';

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: tstz('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: tstz('created_at').notNull(),
  updatedAt: tstz('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: tstz('access_token_expires_at'),
  refreshTokenExpiresAt: tstz('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: tstz('created_at').notNull(),
  updatedAt: tstz('updated_at').notNull(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: tstz('expires_at').notNull(),
  createdAt: tstz('created_at'),
  updatedAt: tstz('updated_at'),
});
