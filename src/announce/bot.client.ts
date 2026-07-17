import { Injectable, Logger } from '@nestjs/common';

export interface AnnouncePayload {
  chatId: number;
  text: string;
  undoRef: string | null;
  undoWindowMinutes: number;
}

export interface AnnounceResult {
  ok: boolean;
  messageId?: number | null;
  error?: string;
}

@Injectable()
export class BotClient {
  private readonly logger = new Logger(BotClient.name);

  async announce(payload: AnnouncePayload): Promise<AnnounceResult> {
    const baseUrl = process.env.BOT_ANNOUNCE_URL;
    if (!baseUrl) {
      this.logger.warn('BOT_ANNOUNCE_URL not configured; announce skipped');
      return { ok: false, error: 'bot_not_configured' };
    }

    try {
      const res = await fetch(`${baseUrl}/internal/announce`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': process.env.INTERNAL_TOKEN ?? '',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        this.logger.warn(`Bot announce failed: HTTP ${res.status}`);
        return { ok: false, error: `http_${res.status}` };
      }

      const data = (await res.json()) as { ok?: boolean; messageId?: number };
      return { ok: !!data.ok, messageId: data.messageId ?? null };
    } catch (err) {
      this.logger.warn(`Bot announce network error: ${(err as Error).message}`);
      return { ok: false, error: 'network_error' };
    }
  }
}
