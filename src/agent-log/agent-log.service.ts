import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../db/db.module';
import { agentActionLog } from '../db/schema';

export interface ClaimAgentLogParams {
  updateId: number;
  telegramUserId?: number | null;
  chatId?: number | null;
  text?: string | null;
}

export interface FinishAgentLogParams {
  updateId: number;
  calls: Array<{
    toolName?: string;
    toolArgs?: unknown;
    result?: unknown;
    changeId?: string;
  }>;
  actorMemberId?: string | null;
}

@Injectable()
export class AgentLogService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async claim(params: ClaimAgentLogParams) {
    const [inserted] = await this.db
      .insert(agentActionLog)
      .values({
        updateId: params.updateId,
        telegramUserId: params.telegramUserId ?? null,
        chatId: params.chatId ?? null,
        messageText: params.text ?? null,
      })
      .onConflictDoNothing({ target: agentActionLog.updateId })
      .returning({ id: agentActionLog.id });

    return { fresh: !!inserted };
  }

  async finish(params: FinishAgentLogParams) {
    const first = params.calls[0];
    const [row] = await this.db
      .update(agentActionLog)
      .set({
        toolName: first?.toolName ?? null,
        toolArgs: first?.toolArgs ?? null,
        result: first?.result ?? null,
        changeId: first?.changeId ?? null,
        status: 'applied',
        memberId: params.actorMemberId ?? null,
      })
      .where(eq(agentActionLog.updateId, params.updateId))
      .returning();

    return row ?? null;
  }
}
