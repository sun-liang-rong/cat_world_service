import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackBatchDto } from './dto/track-batch.dto';
import { TrackEvent } from './entities/track-event.entity';
import {
  isTrackEventName,
  resolveEventTime,
  sanitizeTrackProps,
} from './track-events';

export interface TrackIngestResult {
  accepted: number;
  dropped: number;
}

@Injectable()
export class TrackService {
  private readonly logger = new Logger(TrackService.name);

  constructor(
    @InjectRepository(TrackEvent)
    private readonly events: Repository<TrackEvent>,
  ) {}

  async ingest(dto: TrackBatchDto): Promise<TrackIngestResult> {
    const now = new Date();
    const userId = (dto.user_id ?? '').trim().slice(0, 32);
    const sessionId = dto.session_id.trim().slice(0, 64);
    const platform = (dto.platform ?? '').trim().slice(0, 16);
    const appVersion = (dto.app_version ?? '').trim().slice(0, 32);
    const seen = new Set<string>();
    const rows: Array<Partial<TrackEvent>> = [];

    for (const event of dto.events) {
      if (!isTrackEventName(event.name) || !event.event_id.trim()) {
        continue;
      }
      const eventId = event.event_id.trim().slice(0, 64);
      if (seen.has(eventId)) {
        continue;
      }
      seen.add(eventId);
      rows.push({
        eventId,
        userId,
        sessionId,
        name: event.name,
        eventTime: resolveEventTime(event.ts, now),
        platform,
        appVersion,
        props: sanitizeTrackProps(event.props),
      });
    }

    const dropped = dto.events.length - rows.length;
    if (rows.length === 0) {
      return { accepted: 0, dropped };
    }

    try {
      await this.events
        .createQueryBuilder()
        .insert()
        .into(TrackEvent)
        .values(rows as never)
        .orIgnore()
        .execute();
    } catch (error) {
      this.logger.error(
        '写入埋点失败',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }

    return { accepted: rows.length, dropped };
  }
}
