import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../db/db.module';
import { appSettings } from '../db/schema';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

const SETTINGS_ID = 1;

@Injectable()
export class SettingsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async get() {
    const [row] = await this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID))
      .limit(1);
    if (!row) throw new NotFoundException('Settings not initialized');
    return row;
  }

  async update(dto: UpdateSettingsDto) {
    const [row] = await this.db
      .update(appSettings)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(appSettings.id, SETTINGS_ID))
      .returning();
    if (!row) throw new NotFoundException('Settings not initialized');
    return row;
  }
}
