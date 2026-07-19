import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, eq, gte, ne, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../db/db.module';
import { assignment, classTeacher, klass, member } from '../db/schema';
import type { AddTeacherDto } from './dto/add-teacher.dto';
import type { CreateClassDto } from './dto/create-class.dto';
import type { UpdateClassDto } from './dto/update-class.dto';

@Injectable()
export class ClassesService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  findAll() {
    return this.db.select().from(klass).orderBy(asc(klass.sortOrder));
  }

  create(dto: CreateClassDto) {
    return this.db
      .insert(klass)
      .values(dto)
      .returning()
      .then(([row]) => row);
  }

  async update(id: string, dto: UpdateClassDto) {
    const [row] = await this.db
      .update(klass)
      .set(dto)
      .where(eq(klass.id, id))
      .returning();
    if (!row) throw new NotFoundException('Class not found');
    return row;
  }

  async remove(id: string) {
    const [hasAssignment] = await this.db
      .select({ id: assignment.id })
      .from(assignment)
      .where(eq(assignment.classId, id))
      .limit(1);
    if (hasAssignment)
      throw new UnprocessableEntityException({
        code: 'class_has_assignments',
        message: 'Клас має призначення — спершу видали або перенеси їх.',
      });

    const [row] = await this.db
      .delete(klass)
      .where(eq(klass.id, id))
      .returning();
    if (!row) throw new NotFoundException('Class not found');
    return row;
  }

  async addTeacher(classId: string, dto: AddTeacherDto) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${classId}))`);

      const [classRow] = await tx
        .select()
        .from(klass)
        .where(eq(klass.id, classId))
        .limit(1);
      if (!classRow)
        throw new NotFoundException({
          code: 'not_found',
          message: 'Class not found',
        });

      const [memberRow] = await tx
        .select()
        .from(member)
        .where(eq(member.id, dto.memberId))
        .limit(1);
      if (!memberRow)
        throw new NotFoundException({
          code: 'not_found',
          message: 'Member not found',
        });

      if (dto.isPrimary) {
        await tx
          .update(classTeacher)
          .set({ isPrimary: false })
          .where(eq(classTeacher.classId, classId));
      }

      const [row] = await tx
        .insert(classTeacher)
        .values({
          classId,
          memberId: dto.memberId,
          isPrimary: dto.isPrimary ?? false,
        })
        .onConflictDoUpdate({
          target: [classTeacher.classId, classTeacher.memberId],
          set: { isPrimary: dto.isPrimary ?? false },
        })
        .returning();
      return row;
    });
  }

  async setPrimary(classId: string, memberId: string, isPrimary: boolean) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${classId}))`);

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
      if (!pool)
        throw new NotFoundException({
          code: 'not_found',
          message: 'Teacher not in class pool',
        });

      if (isPrimary) {
        await tx
          .update(classTeacher)
          .set({ isPrimary: false })
          .where(eq(classTeacher.classId, classId));
      }

      const [row] = await tx
        .update(classTeacher)
        .set({ isPrimary })
        .where(
          and(
            eq(classTeacher.classId, classId),
            eq(classTeacher.memberId, memberId),
          ),
        )
        .returning();
      return row;
    });
  }

  async removeTeacher(
    classId: string,
    memberId: string,
    releaseFutureSlots = false,
  ) {
    return this.db.transaction(async (tx) => {
      if (releaseFutureSlots) {
        const today = new Date().toISOString().slice(0, 10);
        // ponytail: pool-management action, not written to assignmentChange/undo.
        await tx
          .update(assignment)
          .set({
            memberId: null,
            originalMemberId: null,
            status: 'planned',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(assignment.classId, classId),
              eq(assignment.memberId, memberId),
              ne(assignment.status, 'cancelled'),
              gte(assignment.date, today),
            ),
          );

        await tx
          .update(assignment)
          .set({ originalMemberId: null, updatedAt: new Date() })
          .where(
            and(
              eq(assignment.classId, classId),
              eq(assignment.originalMemberId, memberId),
              gte(assignment.date, today),
            ),
          );
      }

      const [row] = await tx
        .delete(classTeacher)
        .where(
          and(
            eq(classTeacher.classId, classId),
            eq(classTeacher.memberId, memberId),
          ),
        )
        .returning();
      if (!row) throw new NotFoundException('Teacher not in class pool');
      return row;
    });
  }

  listTeachers(classId: string) {
    return this.db
      .select({
        memberId: member.id,
        fullName: member.fullName,
        displayName: member.displayName,
        isPrimary: classTeacher.isPrimary,
        addedAt: classTeacher.addedAt,
      })
      .from(classTeacher)
      .innerJoin(member, eq(member.id, classTeacher.memberId))
      .where(eq(classTeacher.classId, classId));
  }
}
