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
  ne,
  notInArray,
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
  quarter,
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
      .select({
        className: klass.name,
        presenter: member.fullName,
        status: assignment.status,
      })
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
      status: r.status ?? null,
    }));
  }

  listUpcoming(memberId?: string, limit = 10) {
    const today = new Date().toISOString().slice(0, 10);
    const conditions = [
      gte(assignment.date, today),
      ne(assignment.status, 'cancelled'),
    ];
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
        payload: announcement.payload,
        createdAt: announcement.createdAt,
      })
      .from(announcement)
      .where(announceConditions.length ? and(...announceConditions) : undefined)
      .orderBy(desc(announcement.createdAt));

    return [...changes, ...announcements].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async fillSuggestions(quarterId: string) {
    const [q] = await this.db
      .select()
      .from(quarter)
      .where(eq(quarter.id, quarterId))
      .limit(1);
    if (!q) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Quarter not found',
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    const assignments = await this.db
      .select({
        id: assignment.id,
        classId: assignment.classId,
        className: klass.name,
        sortOrder: klass.sortOrder,
        date: assignment.date,
        memberId: assignment.memberId,
        status: assignment.status,
      })
      .from(assignment)
      .innerJoin(klass, eq(klass.id, assignment.classId))
      .where(eq(assignment.quarterId, quarterId));

    const poolRows = await this.db
      .select({
        classId: classTeacher.classId,
        memberId: classTeacher.memberId,
        name: member.fullName,
        isPrimary: classTeacher.isPrimary,
      })
      .from(classTeacher)
      .innerJoin(member, eq(member.id, classTeacher.memberId))
      .where(eq(member.isActive, true));

    const poolByClass = new Map<
      string,
      { memberId: string; name: string; isPrimary: boolean }[]
    >();
    for (const p of poolRows) {
      const list = poolByClass.get(p.classId) ?? [];
      list.push({ memberId: p.memberId, name: p.name, isPrimary: p.isPrimary });
      poolByClass.set(p.classId, list);
    }
    for (const list of poolByClass.values()) {
      list.sort((a, b) =>
        a.isPrimary === b.isPrimary
          ? a.name.localeCompare(b.name)
          : a.isPrimary
            ? -1
            : 1,
      );
    }

    const baseLoad = new Map<string, number>();
    const takenByDate = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (a.memberId && a.status !== 'cancelled') {
        baseLoad.set(a.memberId, (baseLoad.get(a.memberId) ?? 0) + 1);
      }
      if (a.memberId) {
        const set = takenByDate.get(a.date) ?? new Set<string>();
        set.add(a.memberId);
        takenByDate.set(a.date, set);
      }
    }

    const holes = assignments
      .filter((a) => !a.memberId && a.status !== 'cancelled' && a.date >= today)
      .sort((a, b) =>
        a.date === b.date
          ? a.sortOrder - b.sortOrder
          : a.date < b.date
            ? -1
            : 1,
      );

    const load = new Map(baseLoad);

    const result = holes.map((h) => {
      const pool = poolByClass.get(h.classId) ?? [];
      const taken = takenByDate.get(h.date) ?? new Set<string>();
      const candidates = pool.filter((p) => !taken.has(p.memberId));

      let suggestedMemberId: string | null = null;
      if (candidates.length > 0) {
        const picked = candidates.reduce((best, cur) => {
          const bestLoad = load.get(best.memberId) ?? 0;
          const curLoad = load.get(cur.memberId) ?? 0;
          if (curLoad !== bestLoad) return curLoad < bestLoad ? cur : best;
          if (cur.isPrimary !== best.isPrimary)
            return cur.isPrimary ? cur : best;
          return cur.name.localeCompare(best.name) < 0 ? cur : best;
        });
        suggestedMemberId = picked.memberId;
        load.set(picked.memberId, (load.get(picked.memberId) ?? 0) + 1);
        const set = takenByDate.get(h.date) ?? new Set<string>();
        set.add(picked.memberId);
        takenByDate.set(h.date, set);
      }

      return {
        assignmentId: h.id,
        classId: h.classId,
        className: h.className,
        date: h.date,
        suggestedMemberId,
        options: pool.map((p) => ({
          memberId: p.memberId,
          name: p.name,
          inPool: true,
          quarterLoad: baseLoad.get(p.memberId) ?? 0,
        })),
      };
    });

    return { holes: result };
  }

  private async assertActiveInPool(
    tx: Tx,
    memberId: string,
    classId: string,
    requirePool = true,
  ) {
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
    if (!requirePool) return;

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

  private async assertNotDoubleBooked(
    tx: Tx,
    memberId: string,
    date: string,
    exceptAssignmentId: string | string[],
  ) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${memberId} || ':' || ${date}))`,
    );

    const exceptIds = Array.isArray(exceptAssignmentId)
      ? exceptAssignmentId
      : [exceptAssignmentId];

    const [clash] = await tx
      .select({ id: assignment.id })
      .from(assignment)
      .where(
        and(
          eq(assignment.memberId, memberId),
          eq(assignment.date, date),
          ne(assignment.status, 'cancelled'),
          notInArray(assignment.id, exceptIds),
        ),
      )
      .limit(1);
    if (clash) {
      throw new UnprocessableEntityException({
        code: 'double_booked',
        message: 'Цей вчитель уже веде інший клас у цю дату.',
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

  private assertNotCancelled(a: { status: string }, ctx: MutationCtx) {
    if (a.status === 'cancelled' && !ctx.canAssignAny) {
      throw new UnprocessableEntityException({
        code: 'lesson_cancelled',
        message: 'Урок скасовано',
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
      this.assertNotCancelled(a, ctx);
      await this.assertActiveInPool(tx, toMemberId, a.classId, !ctx.canAssignAny);
      await this.assertNotDoubleBooked(tx, toMemberId, a.date, assignmentId);

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
    tx?: Tx,
  ) {
    const run = async (t: Tx) => {
      const a = await this.loadAssignmentForUpdate(t, assignmentId);
      this.assertOwnership(a, ctx);
      this.assertNotCancelled(a, ctx);
      await this.assertActiveInPool(t, substituteMemberId, a.classId, !ctx.canAssignAny);
      await this.assertNotDoubleBooked(t, substituteMemberId, a.date, assignmentId);

      const fromMemberId = a.memberId;
      const prevState = this.snapshotOf(a);
      await t
        .update(assignment)
        .set({
          originalMemberId: a.originalMemberId ?? a.memberId,
          memberId: substituteMemberId,
          status: 'planned',
          updatedAt: new Date(),
        })
        .where(eq(assignment.id, assignmentId));

      const [change] = await t
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
    };
    return tx ? run(tx) : this.db.transaction(run);
  }

  async claim(assignmentId: string, ctx: MutationCtx) {
    return this.db.transaction(async (tx) => {
      const a = await this.loadAssignmentForUpdate(tx, assignmentId);
      if (a.status !== 'needs_substitute') {
        throw new UnprocessableEntityException({
          code: 'not_claimable',
          message: 'Slot is not awaiting a substitute',
        });
      }
      await this.assertActiveInPool(tx, ctx.actorMemberId!, a.classId);
      await this.assertNotDoubleBooked(tx, ctx.actorMemberId!, a.date, assignmentId);

      const prevState = this.snapshotOf(a);
      await tx
        .update(assignment)
        .set({
          originalMemberId: a.originalMemberId ?? a.memberId,
          memberId: ctx.actorMemberId,
          status: 'planned',
          updatedAt: new Date(),
        })
        .where(eq(assignment.id, assignmentId));

      const [change] = await tx
        .insert(assignmentChange)
        .values({
          assignmentId,
          type: 'substitute',
          fromMemberId: a.memberId,
          toMemberId: ctx.actorMemberId,
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

      if (aRow.status === 'cancelled' || bRow.status === 'cancelled') {
        throw new UnprocessableEntityException({
          code: 'lesson_cancelled',
          message: 'Не можна обмінятись скасованим уроком',
        });
      }

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

        if (bRow.memberId)
          await this.assertActiveInPool(tx, bRow.memberId, aRow.classId, true);
        if (aRow.memberId)
          await this.assertActiveInPool(tx, aRow.memberId, bRow.classId, true);
      }

      if (bRow.memberId)
        await this.assertNotDoubleBooked(tx, bRow.memberId, aRow.date, bRow.id);
      if (aRow.memberId)
        await this.assertNotDoubleBooked(tx, aRow.memberId, bRow.date, aRow.id);

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
      this.assertNotCancelled(a, ctx);

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

  async revert(assignmentId: string, ctx: MutationCtx) {
    return this.db.transaction(async (tx) => {
      const a = await this.loadAssignmentForUpdate(tx, assignmentId);
      if (a.status !== 'needs_substitute') {
        throw new UnprocessableEntityException({
          code: 'not_revertable',
          message: 'Slot is not awaiting a substitute',
        });
      }
      this.assertOwnership(a, ctx);

      const prevState = this.snapshotOf(a);
      await tx
        .update(assignment)
        .set({ status: 'planned', updatedAt: new Date() })
        .where(eq(assignment.id, assignmentId));

      const [change] = await tx
        .insert(assignmentChange)
        .values({
          assignmentId,
          type: 'reassign',
          fromMemberId: a.memberId,
          toMemberId: a.memberId,
          actorMemberId: ctx.actorMemberId,
          source: ctx.source,
          prevState,
        })
        .returning({ id: assignmentChange.id });

      return { changeId: change.id };
    });
  }

  async cancel(assignmentId: string, ctx: MutationCtx) {
    return this.db.transaction(async (tx) => {
      const a = await this.loadAssignmentForUpdate(tx, assignmentId);
      this.assertOwnership(a, ctx);

      const prevState = this.snapshotOf(a);
      await tx
        .update(assignment)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(assignment.id, assignmentId));

      const [change] = await tx
        .insert(assignmentChange)
        .values({
          assignmentId,
          type: 'cancel',
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

  async bulkAssign(
    items: { assignmentId: string; memberId: string }[],
    ctx: MutationCtx,
  ) {
    if (items.length === 0) {
      throw new BadRequestException({
        code: 'invalid_bulk',
        message: 'items must not be empty',
      });
    }
    const ids = items.map((i) => i.assignmentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({
        code: 'invalid_bulk',
        message: 'Duplicate assignmentId in items',
      });
    }

    const sorted = [...items].sort((a, b) =>
      a.assignmentId < b.assignmentId
        ? -1
        : a.assignmentId > b.assignmentId
          ? 1
          : 0,
    );

    return this.db.transaction(async (tx) => {
      const swapGroupId = randomUUID();
      const now = new Date();
      const seenMemberDate = new Set<string>();

      for (const item of sorted) {
        const a = await this.loadAssignmentForUpdate(tx, item.assignmentId);
        const memberDateKey = `${item.memberId}|${a.date}`;
        if (seenMemberDate.has(memberDateKey)) {
          throw new UnprocessableEntityException({
            code: 'double_booked',
            message: 'Цей вчитель уже веде інший клас у цю дату.',
          });
        }
        seenMemberDate.add(memberDateKey);
        await this.assertActiveInPool(tx, item.memberId, a.classId, !ctx.canAssignAny);
        await this.assertNotDoubleBooked(tx, item.memberId, a.date, item.assignmentId);

        const prevState = this.snapshotOf(a);
        await tx
          .update(assignment)
          .set({
            memberId: item.memberId,
            originalMemberId: null,
            status: 'planned',
            updatedAt: now,
          })
          .where(eq(assignment.id, item.assignmentId));

        await tx.insert(assignmentChange).values({
          assignmentId: item.assignmentId,
          swapGroupId,
          type: a.memberId ? 'reassign' : 'assign',
          fromMemberId: a.memberId,
          toMemberId: item.memberId,
          actorMemberId: ctx.actorMemberId,
          source: ctx.source,
          prevState,
        });
      }

      return { swapGroupId, count: items.length };
    });
  }

  async undo(
    ref: string,
    byMemberId: string | null,
    opts?: { actorScoped?: boolean },
  ) {
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

      if (
        opts?.actorScoped &&
        changes.some((c) => c.actorMemberId !== byMemberId)
      ) {
        return {
          ok: false,
          message: 'Скасувати цю дію може лише той, хто її зробив.',
        };
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

      const lockedAssignments = await tx
        .select({ id: assignment.id, date: assignment.date })
        .from(assignment)
        .where(inArray(assignment.id, assignmentIds))
        .for('update');
      const dateByAssignmentId = new Map(
        lockedAssignments.map((r) => [r.id, r.date]),
      );

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
        if (change.prevState.memberId) {
          const date = dateByAssignmentId.get(change.assignmentId)!;
          await this.assertNotDoubleBooked(
            tx,
            change.prevState.memberId,
            date,
            assignmentIds,
          );
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
