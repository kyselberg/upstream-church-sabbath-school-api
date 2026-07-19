import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNotNull, ne } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../db/db.module';
import {
  assignment,
  classTeacher,
  klass,
  member,
  substitutionRequest,
} from '../db/schema';
import { ScheduleService } from '../schedule/schedule.service';

export function isOwner(
  a: { memberId: string | null },
  actorMemberId: string,
): boolean {
  return a.memberId === actorMemberId;
}

export function isResponder(
  req: { toMemberId: string },
  respondingMemberId: string,
): boolean {
  return respondingMemberId === req.toMemberId;
}

export function isCandidateInPool(
  poolRow: { memberId: string } | undefined,
): boolean {
  return poolRow !== undefined;
}

export function formatGroupText(
  candidateName: string,
  requesterName: string,
  className: string,
  date: string,
): string {
  return `🔄 Заміна: ${candidateName} замінює ${requesterName} — ${className}, ${date}`;
}

export async function membersBusyOnDate(
  db: Pick<Db, 'selectDistinct'>,
  date: string,
  memberIds: string[],
): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ memberId: assignment.memberId })
    .from(assignment)
    .where(
      and(
        eq(assignment.date, date),
        inArray(assignment.memberId, memberIds),
        ne(assignment.status, 'cancelled'),
      ),
    );
  return new Set(
    rows.map((r) => r.memberId).filter((id): id is string => id !== null),
  );
}

@Injectable()
export class SubstitutionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly schedule: ScheduleService,
  ) {}

  async candidates(assignmentId: string, actorMemberId: string) {
    const [a] = await this.db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentId))
      .limit(1);
    if (!a) return { error: 'assignment_not_found' as const };
    if (!isOwner(a, actorMemberId)) return { error: 'not_owner' as const };
    if (a.status === 'cancelled') return { error: 'lesson_cancelled' as const };

    const today = new Date().toISOString().slice(0, 10);
    if (a.date < today) return { error: 'past_lesson' as const };

    const pool = await this.db
      .select({
        memberId: member.id,
        fullName: member.fullName,
        telegramUserId: member.telegramUserId,
      })
      .from(classTeacher)
      .innerJoin(member, eq(member.id, classTeacher.memberId))
      .where(
        and(
          eq(classTeacher.classId, a.classId),
          eq(member.isActive, true),
          isNotNull(member.telegramUserId),
          ne(member.id, actorMemberId),
        ),
      );
    if (pool.length === 0) return { candidates: [] };

    const busy = await membersBusyOnDate(
      this.db,
      a.date,
      pool.map((p) => p.memberId),
    );
    const free = pool.filter((p) => !busy.has(p.memberId));
    if (free.length === 0) return { candidates: [] };

    const upcoming = await this.db
      .select({ memberId: assignment.memberId, status: assignment.status })
      .from(assignment)
      .where(
        and(
          inArray(
            assignment.memberId,
            free.map((p) => p.memberId),
          ),
          gte(assignment.date, today),
        ),
      );

    const loadByMember = new Map<string, number>();
    for (const u of upcoming) {
      if (!u.memberId || u.status === 'cancelled') continue;
      loadByMember.set(u.memberId, (loadByMember.get(u.memberId) ?? 0) + 1);
    }

    const candidates = [...free].sort((x, y) => {
      const lx = loadByMember.get(x.memberId) ?? 0;
      const ly = loadByMember.get(y.memberId) ?? 0;
      return lx !== ly ? lx - ly : x.fullName.localeCompare(y.fullName);
    });

    return { candidates };
  }

  async request(
    assignmentId: string,
    fromMemberId: string,
    toMemberId: string,
  ) {
    const [a] = await this.db
      .select()
      .from(assignment)
      .where(eq(assignment.id, assignmentId))
      .limit(1);
    if (!a) return { error: 'assignment_not_found' as const };
    if (!isOwner(a, fromMemberId)) return { error: 'not_owner' as const };
    if (a.status === 'cancelled') return { error: 'lesson_cancelled' as const };

    const today = new Date().toISOString().slice(0, 10);
    if (a.date < today) return { error: 'past_lesson' as const };
    if (toMemberId === fromMemberId)
      return { error: 'invalid_candidate' as const };

    const [candidate] = await this.db
      .select({ id: member.id })
      .from(classTeacher)
      .innerJoin(member, eq(member.id, classTeacher.memberId))
      .where(
        and(
          eq(classTeacher.classId, a.classId),
          eq(classTeacher.memberId, toMemberId),
          eq(member.isActive, true),
          isNotNull(member.telegramUserId),
        ),
      )
      .limit(1);
    if (!candidate) return { error: 'invalid_candidate' as const };

    const busy = await membersBusyOnDate(this.db, a.date, [toMemberId]);
    if (busy.has(toMemberId)) return { error: 'candidate_busy' as const };

    return this.db.transaction(async (tx) => {
      await tx
        .select({ id: assignment.id })
        .from(assignment)
        .where(eq(assignment.id, assignmentId))
        .for('update');

      await tx
        .update(substitutionRequest)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(substitutionRequest.assignmentId, assignmentId),
            eq(substitutionRequest.status, 'pending'),
          ),
        );

      const [row] = await tx
        .insert(substitutionRequest)
        .values({ assignmentId, fromMemberId, toMemberId })
        .returning({ id: substitutionRequest.id });

      const [requester] = await tx
        .select({ fullName: member.fullName })
        .from(member)
        .where(eq(member.id, fromMemberId))
        .limit(1);
      const [toM] = await tx
        .select({ telegramUserId: member.telegramUserId })
        .from(member)
        .where(eq(member.id, toMemberId))
        .limit(1);
      const [cls] = await tx
        .select({ name: klass.name })
        .from(klass)
        .where(eq(klass.id, a.classId))
        .limit(1);

      return {
        requestId: row.id,
        candidateTelegramUserId: toM.telegramUserId,
        requesterName: requester.fullName,
        className: cls.name,
        date: a.date,
      };
    });
  }

  async respond(requestId: string, accept: boolean, byTelegramUserId: number) {
    return this.db.transaction(async (tx) => {
      const [reqRow] = await tx
        .select()
        .from(substitutionRequest)
        .where(eq(substitutionRequest.id, requestId))
        .for('update');
      if (!reqRow || reqRow.status !== 'pending')
        return { error: 'not_pending' as const };

      const [responder] = await tx
        .select({ id: member.id })
        .from(member)
        .where(eq(member.telegramUserId, byTelegramUserId))
        .limit(1);
      if (!responder || !isResponder(reqRow, responder.id))
        return { error: 'not_your_request' as const };

      const [a] = await tx
        .select()
        .from(assignment)
        .where(eq(assignment.id, reqRow.assignmentId))
        .for('update');
      const [requester] = await tx
        .select({
          fullName: member.fullName,
          telegramUserId: member.telegramUserId,
        })
        .from(member)
        .where(eq(member.id, reqRow.fromMemberId))
        .limit(1);
      const [candidateM] = await tx
        .select({ fullName: member.fullName, isActive: member.isActive })
        .from(member)
        .where(eq(member.id, reqRow.toMemberId))
        .limit(1);

      const now = new Date();
      if (!accept) {
        await tx
          .update(substitutionRequest)
          .set({ status: 'declined', respondedAt: now })
          .where(eq(substitutionRequest.id, requestId));
        return {
          ok: true as const,
          declined: true as const,
          requesterTelegramUserId: requester.telegramUserId,
          candidateName: candidateM.fullName,
        };
      }

      const supersede = async (
        error:
          | 'assignment_gone'
          | 'holder_changed'
          | 'candidate_unavailable'
          | 'lesson_cancelled'
          | 'past_lesson'
          | 'candidate_busy',
      ) => {
        await tx
          .update(substitutionRequest)
          .set({ status: 'superseded', respondedAt: now })
          .where(eq(substitutionRequest.id, requestId));
        return { error };
      };
      if (!a) return supersede('assignment_gone');
      if (!isOwner(a, reqRow.fromMemberId)) return supersede('holder_changed');
      if (!candidateM.isActive) return supersede('candidate_unavailable');

      const [poolRow] = await tx
        .select({ memberId: classTeacher.memberId })
        .from(classTeacher)
        .innerJoin(member, eq(member.id, classTeacher.memberId))
        .where(
          and(
            eq(classTeacher.classId, a.classId),
            eq(classTeacher.memberId, reqRow.toMemberId),
            eq(member.isActive, true),
          ),
        )
        .limit(1);
      if (!isCandidateInPool(poolRow)) return supersede('candidate_unavailable');

      if (a.status === 'cancelled') return supersede('lesson_cancelled');

      const today = new Date().toISOString().slice(0, 10);
      if (a.date < today) return supersede('past_lesson');

      const busy = await membersBusyOnDate(tx, a.date, [reqRow.toMemberId]);
      if (busy.has(reqRow.toMemberId)) return supersede('candidate_busy');

      const [cls] = await tx
        .select({ name: klass.name })
        .from(klass)
        .where(eq(klass.id, a.classId))
        .limit(1);

      // ponytail: isResponder() above already proved byTelegramUserId IS the
      // candidate named on this request — that consent is the authorization,
      // so canAssignAny:true here doesn't reopen the ownership hole Task 1b closed.
      await this.schedule.substitute(
        reqRow.assignmentId,
        reqRow.toMemberId,
        {
          actorMemberId: reqRow.toMemberId,
          source: 'telegram',
          canAssignAny: true,
        },
        tx,
      );

      await tx
        .update(substitutionRequest)
        .set({ status: 'accepted', respondedAt: now })
        .where(eq(substitutionRequest.id, requestId));

      return {
        ok: true as const,
        groupText: formatGroupText(
          candidateM.fullName,
          requester.fullName,
          cls.name,
          a.date,
        ),
        requesterTelegramUserId: requester.telegramUserId,
        requesterName: requester.fullName,
        candidateName: candidateM.fullName,
        className: cls.name,
        date: a.date,
      };
    });
  }
}
