import { TrackDashboardService } from './track-dashboard.service';
import { resolveTrackQuery } from './track-query';
import type { Repository } from 'typeorm';
import type { TrackEvent } from './entities/track-event.entity';

describe('first launch cohorts', () => {
  it('keeps immature retention empty and derives rates from unique players', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-10T06:00:00Z'));
    const query = jest.fn().mockResolvedValue([
      { day: '2026-10-01', new_users: 10, retained_1: 5, retained_3: 3, retained_7: 2, start_2: 8, clear_5: 4, clear_20: 1 },
      { day: '2026-10-09', new_users: 2, retained_1: 1, retained_3: 0, retained_7: 0, start_2: 1, clear_5: 0, clear_20: 0 },
    ]);
    const service = new TrackDashboardService({ query } as unknown as Repository<TrackEvent>);
    const result = await (service as any).buildCohorts(resolveTrackQuery({ from: '2026-10-01', to: '2026-10-10', platform: 'wechat' }));
    expect(result.observed_through).toBe('2026-10-09');
    expect(result.rows[0]).toEqual({ day: '2026-10-01', new_users: 10, d1: 0.5, d3: 0.3, d7: 0.2, start_2: 0.8, clear_5: 0.4, clear_20: 0.1 });
    expect(result.rows[1].d1).toBeNull();
    expect(result.rows[1].d7).toBeNull();
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('MIN(event_time)');
    expect(sql).toContain('HAVING first_seen >= ?');
    expect(sql).toContain('e.platform = c.platform');
    expect(values).toEqual(['wechat', '2026-10-01 00:00:00', '2026-10-11 00:00:00', '2026-10-11 00:00:00']);
    jest.useRealTimers();
  });
});
