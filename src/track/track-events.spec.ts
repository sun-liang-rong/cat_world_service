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

  it('keeps primitive props and short string arrays', () => {
    expect(
      sanitizeTrackProps({
        page_id: 'home',
        duration_ms: 1200,
        win: true,
        used_items: ['hammer', 'dice'],
        nested: { skip: true },
        empty: null,
      }),
    ).toEqual({
      page_id: 'home',
      duration_ms: 1200,
      win: true,
      used_items: ['hammer', 'dice'],
      empty: null,
    });
  });

  it('drops invalid prop containers', () => {
    expect(sanitizeTrackProps(['nope'])).toEqual({});
    expect(sanitizeTrackProps(null)).toEqual({});
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
