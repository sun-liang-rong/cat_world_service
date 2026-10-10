import {
  isTrackEventName,
  resolveEventTime,
  sanitizeTrackProps,
} from './track-events';

describe('track event helpers', () => {
  it('accepts only the P0 event names', () => {
    expect(isTrackEventName('app_launch')).toBe(true);
    expect(isTrackEventName('shop_buy')).toBe(true);
    expect(isTrackEventName('level_win')).toBe(false);
    expect(isTrackEventName('')).toBe(false);
  });

  it('keeps only event schema keys and matching types', () => {
    expect(
      sanitizeTrackProps({
        mode: 'main',
        coins: 9999,
        cats: { orange: true },
        duration_ms: 1200,
          used_items: ['hammer', 'dice'],
        nested: { skip: true },
        }, 'level_end'),
    ).toEqual({
      mode: 'main',
      duration_ms: 1200,
      used_items: ['hammer', 'dice'],
    });
  });

  it('drops invalid prop containers', () => {
    expect(sanitizeTrackProps(['nope'], 'level_start')).toEqual({});
    expect(sanitizeTrackProps(null, 'level_start')).toEqual({});
  });

  it('drops arbitrary gameplay data, incorrect types and missing event names', () => {
    expect(sanitizeTrackProps({ level: '2', mode: 'main', coins: 900, player_state: '{}' }, 'level_start')).toEqual({ mode: 'main' });
    expect(sanitizeTrackProps({ level: 2 })).toEqual({});
    expect(sanitizeTrackProps({ used_items: ['hammer', 1] }, 'level_end')).toEqual({});
  });

  it('falls back to now when the client timestamp is unusable', () => {
    const now = new Date('2026-09-20T08:00:00.000Z');
    expect(resolveEventTime('bad', now)).toEqual(now);
    expect(resolveEventTime(123, now)).toEqual(now);
    expect(resolveEventTime(now.getTime() + 120_000, now)).toEqual(now);
    expect(resolveEventTime(now.getTime() - 1000, now)).toEqual(
      new Date(now.getTime() - 1000),
    );
  });
});
