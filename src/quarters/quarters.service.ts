import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import { saturdaysBetween } from '../common/dates';
import { DRIZZLE, type Db } from '../db/db.module';
import { assignment, classTeacher, klass, member, quarter } from '../db/schema';
import type { CreateQuarterDto } from './dto/create-quarter.dto';
import type { UpdateQuarterDto } from './dto/update-quarter.dto';

@Injectable()
export class QuartersService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  findAll() {
    return this.db.select().from(quarter);
  }

  create(dto: CreateQuarterDto) {
    return this.db
      .insert(quarter)
      .values(dto)
      .returning()
      .then(([row]) => row);
  }

  async update(id: string, dto: UpdateQuarterDto) {
    const [row] = await this.db
      .update(quarter)
      .set(dto)
      .where(eq(quarter.id, id))
      .returning();
    if (!row) throw new NotFoundException('Quarter not found');
    return row;
  }

  async remove(id: string) {
    const [row] = await this.db
      .delete(quarter)
      .where(eq(quarter.id, id))
      .returning();
    if (!row) throw new NotFoundException('Quarter not found');
    return row;
  }

  async generateSaturdays(id: string, autoFill = false) {
    const [q] = await this.db
      .select()
      .from(quarter)
      .where(eq(quarter.id, id))
      .limit(1);
    if (!q) throw new NotFoundException('Quarter not found');

    const saturdays = saturdaysBetween(q.startDate, q.endDate);
    const activeClasses = await this.db
      .select()
      .from(klass)
      .where(eq(klass.isActive, true));

    const poolByClass = new Map<string, string[]>();
    if (autoFill) {
      const poolRows = await this.db
        .select({
          classId: classTeacher.classId,
          memberId: classTeacher.memberId,
        })
        .from(classTeacher)
        .innerJoin(member, eq(member.id, classTeacher.memberId))
        .where(eq(member.isActive, true))
        .orderBy(desc(classTeacher.isPrimary), asc(classTeacher.memberId));

      for (const p of poolRows) {
        const list = poolByClass.get(p.classId) ?? [];
        list.push(p.memberId);
        poolByClass.set(p.classId, list);
      }
    }

    const rows = activeClasses.flatMap((c) => {
      const pool = poolByClass.get(c.id) ?? [];
      return saturdays.map((date, i) => ({
        classId: c.id,
        date,
        quarterId: id,
        status: 'planned' as const,
        memberId: pool.length > 0 ? pool[i % pool.length] : null,
      }));
    });

    if (rows.length === 0) return { saturdays, created: 0 };

    const inserted = await this.db
      .insert(assignment)
      .values(rows)
      .onConflictDoNothing({ target: [assignment.classId, assignment.date] })
      .returning({ id: assignment.id });

    return { saturdays, created: inserted.length };
  }
}
