import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DRIZZLE, type Db } from '../db/db.module';
import {
  announcement,
  appSettings,
  assignment,
  assignmentChange,
  assignmentStatus,
  classTeacher,
  klass,
  member,
} from '../db/schema';

export type ChangeSource = 'web' | 'telegram' | 'system';

export interface MutationCtx {
  actorMemberId: string | null;
  source: ChangeSource;
  canAssignAny?: boolean;
}

type TxFn = Parameters<Db['transaction']>[0];
type Tx = TxFn extends (tx: infer T) => unknown ? T : never;

@Injectable()
export class ScheduleService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  listAssignments(params: { from?: string; to?: string; classId?: string }) {
    const conditions = [];
    if (params.from) conditions.push(gte(assignment.date, params.from));
    if (params.to) conditions.push(lte(assignment.date, params.to));
    if (params.classId) conditions.push(eq(assignment.classId, params.classId));

    return this.db
      .select({
        id: assignment.id,
        classId: assignment.classId,
        className: klass.name,
        date: assignment.date,
        memberId: assignment.memberId,
        memberName: member.fullName,
        originalMemberId: assignment.originalMemberId,
        status: assignment.status,
        note: assignment.note,
      })
      .from(assignment)
      .innerJoin(klass, eq(klass.id, assignment.classId))
      .leftJoin(member, eq(member.id, assignment.memberId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(assignment.date), asc(klass.sortOrder));
  }

  async who(date: string) {
    const rows = await this.db
      .select({ className: klass.name, presenter: member.fullName })
      .from(klass)
      .leftJoin(
        assignment,
        and(eq(assignment.classId, klass.id), eq(assignment.date, date)),
      )
      .leftJoin(member, eq(member.id, assignment.memberId))
      .where(eq(klass.isActive, true))
      .orderBy(asc(klass.sortOrder));

    return rows.map((r) => ({
      className: r.className,
      presenter: r.presenter ?? null,
    }));
  }

  listUpcoming(memberId?: string, limit = 10) {
    const today = new Date().toISOString().slice(0, 10);
    const conditions = [gte(assignment.date, today)];
    if (memberId) conditions.push(eq(assignment.memberId, memberId));

    return this.db
      .select({
        id: assignment.id,
        classId: assignment.classId,
        className: klass.name,
        date: assignment.date,
        memberId: assignment.memberId,
        memberName: member.fullName,
        status: assignment.status,
      })
      .from(assignment)
      .innerJoin(klass, eq(klass.id, assignment.classId))
      .leftJoin(member, eq(member.id, assignment.memberId))
      .where(and(...conditions))
      .orderBy(asc(assignment.date), asc(klass.sortOrder))
      .limit(limit);
  }

  async getAssignment(classId: string, date: string) {
    const [row] = await this.db
      .select()
      .from(assignment)
      .where(and(eq(assignment.classId, classId), eq(assignment.date, date)))
      .limit(1);
    return row ?? null;
  }

  async listActivity(from?: string, to?: string) {
    const fromMember = alias(member, 'from_member');
    const toMember = alias(member, 'to_member');
    const actorMember = alias(member, 'actor_member');

    const changeConditions = [];
    if (from) changeConditions.push(gte(assignment.date, from));
    if (to) changeConditions.push(lte(assignment.date, to));

    const changes = await this.db
      .select({
        kind: assignmentChange.type,
        id: assignmentChange.id,
        assignmentId: assignmentChange.assignmentId,
        classId: assignment.classId,
        className: klass.name,
        date: assignment.date,
        fromMemberId: assignmentChange.fromMemberId,
        fromMemberName: fromMember.fullName,
        toMemberId: assignmentChange.toMemberId,
        toMemberName: toMember.fullName,
        actorMemberId: assignmentChange.actorMemberId,
        actorMemberName: actorMember.fullName,
        source: assignmentChange.source,
        swapGroupId: assignmentChange.swapGroupId,
        undoneAt: assignmentChange.undoneAt,
        createdAt: assignmentChange.createdAt,
      })
      .from(assignmentChange)
      .innerJoin(assignment, eq(assignment.id, assignmentChange.assignmentId))
      .innerJoin(klass, eq(klass.id, assignment.classId))
      .leftJoin(fromMember, eq(fromMember.id, assignmentChange.fromMemberId))
      .leftJoin(toMember, eq(toMember.id, assignmentChange.toMemberId))
      .leftJoin(actorMember, eq(actorMember.id, assignmentChange.actorMemberId))
      .where(changeConditions.length ? and(...changeConditions) : undefined)
      .orderBy(desc(assignmentChange.createdAt));

    const announceConditions = [];
    if (from) announceConditions.push(gte(announcement.targetDate, from));
    if (to) announceConditions.push(lte(announcement.targetDate, to));

    const announcements = await this.db
      .select({
        kind: announcement.type,
        id: announcement.id,
        targetDate: announcement.targetDate,
        status: announcement.status,
        changeId: announcement.changeId,
        swapGroupId: announcement.swapGroupId,
        createdAt: announcement.createdAt,
      })
      .from(announcement)
      .where(announceConditions.length ? and(...announceConditions) : undefined)
      .orderBy(desc(announcement.createdAt));

    return [...changes, ...announcements].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  private async assertActiveInPool(tx: Tx, memberId: string, classId: string) {
    const [m] = await tx
      .select()
      .from(member)
      .where(eq(member.id, memberId))
      .limit(1);
    if (!m || !m.isActive) {
      throw new UnprocessableEntityException({
        code: 'not_in_pool',
        message: 'Member is not active',
      });
    }

    const [pool] = await tx
      .select()
      .from(classTeacher)
      .where(
        and(
          eq(classTeacher.classId, classId),
          eq(classTeacher.memberId, memberId),
        ),
      )
      .limit(1);
    if (!pool) {
      throw new UnprocessableEntityException({
        code: 'not_in_pool',
        message: 'Member is not in the class pool',
      });
    }
  }

  private assertOwnership(
    a: { memberId: string | null; originalMemberId: string | null },
    ctx: MutationCtx,
  ) {
    if (ctx.canAssignAny) return;
    const actorId = ctx.actorMemberId;
    if (
      !actorId ||
      (a.memberId !== actorId && a.originalMemberId !== actorId)
    ) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'Not your assignment',
      });
    }
  }

  private async loadAssignmentForUpdate(tx: Tx, id: string) {
    const [row] = await tx
      .select()
      .from(assignment)
      .where(eq(assignment.id, id))
      .for('update');
    if (!row) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Assignment not found',
      });
    }
    return row;
  }

  private snapshotOf(a: {
    memberId: string | null;
    originalMemberId: string | null;
    status: string;
  }) {
    return {
      memberId: a.memberId,
      originalMemberId: a.originalMemberId,
      status: a.status,
    };
  }

  async reassign(assignmentId: string, toMemberId: string, ctx: MutationCtx) {
    return this.db.transaction(async (tx) => {
      const a = await this.loadAssignmentForUpdate(tx, assignmentId);
      this.assertOwnership(a, ctx);
      await this.assertActiveInPool(tx, toMemberId, a.classId);

      const fromMemberId = a.memberId;
      const prevState = this.snapshotOf(a);
      await tx
        .update(assignment)
        .set({
          memberId: toMemberId,
          originalMemberId: null,
          status: 'planned',
          updatedAt: new Date(),
        })
        .where(eq(assignment.id, assignmentId));

      const [change] = await tx
        .insert(assignmentChange)
        .values({
          assignmentId,
          type: fromMemberId ? 'reassign' : 'assign',
          fromMemberId,
          toMemberId,
          actorMemberId: ctx.actorMemberId,
          source: ctx.source,
          prevState,
        })
        .returning({ id: assignmentChange.id });

      return { changeId: change.id };
    });
  }

  async substitute(
    assignmentId: string,
    substituteMemberId: string,
    ctx: MutationCtx,
  ) {
    return this.db.transaction(async (tx) => {
      const a = await this.loadAssignmentForUpdate(tx, assignmentId);
      this.assertOwnership(a, ctx);
      await this.assertActiveInPool(tx, substituteMemberId, a.classId);

      const fromMemberId = a.memberId;
      const prevState = this.snapshotOf(a);
      await tx
        .update(assignment)
        .set({
          originalMemberId: a.originalMemberId ?? a.memberId,
          memberId: substituteMemberId,
          status: 'planned',
          updatedAt: new Date(),
        })
        .where(eq(assignment.id, assignmentId));

      const [change] = await tx
        .insert(assignmentChange)
        .values({
          assignmentId,
          type: 'substitute',
          fromMemberId,
          toMemberId: substituteMemberId,
          actorMemberId: ctx.actorMemberId,
          source: ctx.source,
          prevState,
        })
        .returning({ id: assignmentChange.id });

      return { changeId: change.id };
    });
  }

  // ponytail: retried swaps aren't idempotent-keyed here; callers dedup (bot update_id claim / web single-submit).
  async swap(aAssignmentId: string, bAssignmentId: string, ctx: MutationCtx) {
    if (aAssignmentId === bAssignmentId) {
      throw new BadRequestException({
        code: 'invalid_swap',
        message: 'Cannot swap an assignment with itself',
      });
    }

    return this.db.transaction(async (tx) => {
      const [firstId, secondId] = [aAssignmentId, bAssignmentId].sort();
      const firstRow = await this.loadAssignmentForUpdate(tx, firstId);
      const secondRow = await this.loadAssignmentForUpdate(tx, secondId);
      const aRow = firstId === aAssignmentId ? firstRow : secondRow;
      const bRow = firstId === aAssignmentId ? secondRow : firstRow;

      if (aRow.memberId === bRow.memberId) {
        throw new UnprocessableEntityException({
          code: 'nothing_to_swap',
          message: 'Both slots have the same presenter',
        });
      }

      if (!ctx.canAssignAny) {
        const actorId = ctx.actorMemberId;
        const ownsA =
          !!actorId &&
          (aRow.memberId === actorId || aRow.originalMemberId === actorId);
        const ownsB =
          !!actorId &&
          (bRow.memberId === actorId || bRow.originalMemberId === actorId);
        if (!ownsA && !ownsB) {
          throw new ForbiddenException({
            code: 'forbidden',
            message: 'Not your assignment',
          });
        }
      }

      const swapGroupId = randomUUID();
      const now = new Date();
      const aPrevState = this.snapshotOf(aRow);
      const bPrevState = this.snapshotOf(bRow);

      await tx
        .update(assignment)
        .set({ memberId: bRow.memberId, updatedAt: now })
        .where(eq(assignment.id, aRow.id));
      await tx
        .update(assignment)
        .set({ memberId: aRow.memberId, updatedAt: now })
        .where(eq(assignment.id, bRow.id));

      await tx.insert(assignmentChange).values([
        {
          assignmentId: aRow.id,
          swapGroupId,
          type: 'swap',
          fromMemberId: aRow.memberId,
          toMemberId: bRow.memberId,
          actorMemberId: ctx.actorMemberId,
          source: ctx.source,
          prevState: aPrevState,
        },
        {
          assignmentId: bRow.id,
          swapGroupId,
          type: 'swap',
          fromMemberId: bRow.memberId,
          toMemberId: aRow.memberId,
          actorMemberId: ctx.actorMemberId,
          source: ctx.source,
          prevState: bPrevState,
        },
      ]);

      return { swapGroupId };
    });
  }

  async markUnavailable(assignmentId: string, ctx: MutationCtx) {
    return this.db.transaction(async (tx) => {
      const a = await this.loadAssignmentForUpdate(tx, assignmentId);
      this.assertOwnership(a, ctx);

      const prevState = this.snapshotOf(a);
      await tx
        .update(assignment)
        .set({ status: 'needs_substitute', updatedAt: new Date() })
        .where(eq(assignment.id, assignmentId));

      const [change] = await tx
        .insert(assignmentChange)
        .values({
          assignmentId,
          type: 'unassign',
          fromMemberId: a.memberId,
          toMemberId: null,
          actorMemberId: ctx.actorMemberId,
          source: ctx.source,
          prevState,
        })
        .returning({ id: assignmentChange.id });

      return { changeId: change.id };
    });
  }

  async undo(ref: string, byMemberId: string | null) {
    const [kind, refId] = ref.split(':');
    if (!refId || (kind !== 'change' && kind !== 'swap')) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Invalid undo ref',
      });
    }

    return this.db.transaction(async (tx) => {
      let changes = await (kind === 'swap'
        ? tx
            .select()
            .from(assignmentChange)
            .where(eq(assignmentChange.swapGroupId, refId))
            .for('update')
        : tx
            .select()
            .from(assignmentChange)
            .where(eq(assignmentChange.id, refId))
            .for('update'));

      if (changes.length === 0) {
        throw new NotFoundException({
          code: 'not_found',
          message: 'Change not found',
        });
      }

      if (kind === 'change' && changes[0].swapGroupId) {
        changes = await tx
          .select()
          .from(assignmentChange)
          .where(eq(assignmentChange.swapGroupId, changes[0].swapGroupId))
          .for('update');
      }

      if (changes.some((c) => c.undoneAt)) {
        throw new ConflictException({
          code: 'already_undone',
          message: 'Already undone',
        });
      }

      const [settings] = await tx
        .select({
          undoWindowMinutes: appSettings.undoWindowMinutes,
          dbNow: sql<string>`now()`,
        })
        .from(appSettings)
        .where(eq(appSettings.id, 1))
        .limit(1);
      const windowMinutes = settings?.undoWindowMinutes ?? 30;
      const now = settings?.dbNow ? new Date(settings.dbNow) : new Date();
      const expired = changes.some(
        (c) => (now.getTime() - c.createdAt.getTime()) / 60_000 > windowMinutes,
      );
      if (expired) {
        throw new ConflictException({
          code: 'undo_window_expired',
          message: 'Undo window expired',
        });
      }

      const targetIds = changes.map((c) => c.id);
      const assignmentIds = [...new Set(changes.map((c) => c.assignmentId))];

      const activeRowsForAssignments = await tx
        .select()
        .from(assignmentChange)
        .where(
          and(
            inArray(assignmentChange.assignmentId, assignmentIds),
            isNull(assignmentChange.undoneAt),
          ),
        );
      const isStale = activeRowsForAssignments.some((r) => {
        if (targetIds.includes(r.id)) return false;
        const target = changes.find((c) => c.assignmentId === r.assignmentId);
        return !!target && r.createdAt > target.createdAt;
      });
      if (isStale) {
        throw new ConflictException({
          code: 'stale_undo',
          message: 'A newer change must be undone first',
        });
      }

      const sortedByAssignmentId = [...changes].sort((x, y) =>
        x.assignmentId < y.assignmentId
          ? -1
          : x.assignmentId > y.assignmentId
            ? 1
            : 0,
      );

      for (const change of sortedByAssignmentId) {
        if (!change.prevState) {
          throw new ConflictException({
            code: 'cannot_undo_legacy',
            message: 'Change predates snapshot; cannot undo',
          });
        }
        await tx
          .update(assignment)
          .set({
            memberId: change.prevState.memberId,
            originalMemberId: change.prevState.originalMemberId,
            status: change.prevState
              .status as (typeof assignmentStatus.enumValues)[number],
            updatedAt: now,
          })
          .where(eq(assignment.id, change.assignmentId));
      }

      await tx
        .update(assignmentChange)
        .set({ undoneAt: now, undoneByMemberId: byMemberId })
        .where(inArray(assignmentChange.id, targetIds));

      return { ok: true, message: 'Undone' };
    });
  }
}
