import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryTrackDto } from './dto/query-track.dto';
import { TrackEvent } from './entities/track-event.entity';
import {
  DayUser,
  FUNNEL_STEPS,
  FunnelStepDef,
  TrackQueryRange,
  buildFunnel,
  eachDay,
  ratio,
  resolveTrackQuery,
  round4,
  toDayString,
  toNumber,
} from './track-query';

interface SqlRow {
  [key: string]: unknown;
}

interface ExtraClause {
  sql: string;
  values?: unknown[];
}

export interface TrackRangeMeta {
  from: string;
  to: string;
  platform: string;
  mode: string;
}

export interface TrackOverviewResult {
  range: TrackRangeMeta;
  kpis: {
    dau: number;
    unique_users: number;
    new_users: number;
    launch_count: number;
    load_finish_users: number;
    load_complete_rate: number;
    home_users: number;
    home_rate: number;
    start_users: number;
    start_rate: number;
    win_users: number;
    pass_rate: number;
    fail_users: number;
    go_build_users: number;
    shop_buy_users: number;
    loading_duration: {
      avg_ms: number;
      p50_ms: number;
      p90_ms: number;
      samples: number;
    };
  };
  daily: Array<{
    day: string;
    dau: number;
    new_users: number;
    start_users: number;
    win_users: number;
  }>;
}

export interface TrackFunnelResult {
  range: TrackRangeMeta;
  steps: ReturnType<typeof buildFunnel>;
}

export interface TrackLevelRow {
  mode: string;
  level: number;
  start_count: number;
  start_users: number;
  win_count: number;
  fail_count: number;
  endless_count: number;
  pass_rate: number;
  avg_duration_ms: number;
  fail_had_pair_rate: number;
  avg_fail_progress: number;
  next_count: number;
  replay_count: number;
  home_count: number;
  go_build_count: number;
}

export interface TrackLevelsResult {
  range: TrackRangeMeta;
  rows: TrackLevelRow[];
}

export interface TrackAdRow {
  scene: string;
  show: number;
  click: number;
  completed: number;
  skipped: number;
  error: number;
  simulated: number;
  ctr: number;
  complete_rate: number;
}

export interface TrackAdsResult {
  range: TrackRangeMeta;
  overall: TrackAdRow;
  scenes: TrackAdRow[];
}

export interface TrackPagesResult {
  range: TrackRangeMeta;
  pages: Array<{ page_id: string; views: number; users: number }>;
  economy: {
    building_light: { events: number; users: number };
    shop_buy: { events: number; users: number };
    go_build: { events: number; users: number };
  };
  settlement: {
    next: { events: number; users: number };
    replay: { events: number; users: number };
    home: { events: number; users: number };
    home_mid_run: { events: number; users: number };
    go_build: { events: number; users: number };
  };
}

export interface TrackDashboardResult {
  overview: TrackOverviewResult;
  funnel: TrackFunnelResult;
  levels: TrackLevelsResult;
  ads: TrackAdsResult;
  pages: TrackPagesResult;
}

@Injectable()
export class TrackDashboardService {
  constructor(
    @InjectRepository(TrackEvent)
    private readonly events: Repository<TrackEvent>,
  ) {}

  overview(dto: QueryTrackDto): Promise<TrackOverviewResult> {
    return this.buildOverview(resolveTrackQuery(dto));
  }

  funnel(dto: QueryTrackDto): Promise<TrackFunnelResult> {
    return this.buildFunnel(resolveTrackQuery(dto));
  }

  levels(dto: QueryTrackDto): Promise<TrackLevelsResult> {
    return this.buildLevels(resolveTrackQuery(dto));
  }

  ads(dto: QueryTrackDto): Promise<TrackAdsResult> {
    return this.buildAds(resolveTrackQuery(dto));
  }

  pages(dto: QueryTrackDto): Promise<TrackPagesResult> {
    return this.buildPages(resolveTrackQuery(dto));
  }

  async dashboard(dto: QueryTrackDto): Promise<TrackDashboardResult> {
    const range = resolveTrackQuery(dto);
    const [overview, funnel, levels, ads, pages] = await Promise.all([
      this.buildOverview(range),
      this.buildFunnel(range),
      this.buildLevels(range),
      this.buildAds(range),
      this.buildPages(range),
    ]);
    return { overview, funnel, levels, ads, pages };
  }

  private async buildOverview(
    range: TrackQueryRange,
  ): Promise<TrackOverviewResult> {
    const days = eachDay(range.from, range.to);
    const clearResult = range.mode === 'endless' ? 'endless' : 'win';
    const [
      launchDaily,
      newDaily,
      startDaily,
      winDaily,
      launchUsers,
      newUsers,
      loadUsers,
      homeUsers,
      startUsers,
      winUsers,
      failUsers,
      goBuildUsers,
      shopBuyUsers,
      launchCount,
      loadingDuration,
    ] = await Promise.all([
      this.countDailyUsers(range, 'app_launch'),
      this.countDailyUsers(range, 'app_launch', [this.jsonTrue('is_new_user')]),
      this.countDailyUsers(range, 'level_start', [], true),
      this.countDailyUsers(range, 'level_end', [this.propEq('result', clearResult)], true),
      this.countUniqueUsers(range, 'app_launch'),
      this.countUniqueUsers(range, 'app_launch', [this.jsonTrue('is_new_user')]),
      this.countUniqueUsers(range, 'loading_finish'),
      this.countUniqueUsers(range, 'page_view', [this.propEq('page_id', 'home')]),
      this.countUniqueUsers(range, 'level_start', [], true),
      this.countUniqueUsers(range, 'level_end', [this.propEq('result', clearResult)], true),
      this.countUniqueUsers(range, 'level_end', [this.propEq('result', 'fail')], true),
      this.countUniqueUsers(range, 'level_go_build', [], true),
      this.countUniqueUsers(range, 'shop_buy'),
      this.countEvents(range, 'app_launch'),
      this.loadingDuration(range),
    ]);

    const dailyMap = new Map<
      string,
      { dau: number; new_users: number; start_users: number; win_users: number }
    >();
    for (const day of days) {
      dailyMap.set(day, {
        dau: 0,
        new_users: 0,
        start_users: 0,
        win_users: 0,
      });
    }
    this.fillDaily(dailyMap, launchDaily, 'dau');
    this.fillDaily(dailyMap, newDaily, 'new_users');
    this.fillDaily(dailyMap, startDaily, 'start_users');
    this.fillDaily(dailyMap, winDaily, 'win_users');

    const daily = days.map((day) => ({
      day,
      ...dailyMap.get(day)!,
    }));
    const dau =
      days.length === 0
        ? 0
        : round4(daily.reduce((sum, row) => sum + row.dau, 0) / days.length);

    return {
      range: this.meta(range),
      kpis: {
        dau,
        unique_users: launchUsers,
        new_users: newUsers,
        launch_count: launchCount,
        load_finish_users: loadUsers,
        load_complete_rate: ratio(loadUsers, launchUsers),
        home_users: homeUsers,
        home_rate: ratio(homeUsers, launchUsers),
        start_users: startUsers,
        start_rate: ratio(startUsers, homeUsers || launchUsers),
        win_users: winUsers,
        pass_rate: ratio(winUsers, startUsers),
        fail_users: failUsers,
        go_build_users: goBuildUsers,
        shop_buy_users: shopBuyUsers,
        loading_duration: loadingDuration,
      },
      daily,
    };
  }

  private async buildFunnel(range: TrackQueryRange): Promise<TrackFunnelResult> {
    const steps = FUNNEL_STEPS.map((step) => this.withModeResult(step, range));
    const usersByStep = await Promise.all(
      steps.map((step) => this.funnelUsers(range, step)),
    );
    return {
      range: this.meta(range),
      steps: buildFunnel(steps, usersByStep),
    };
  }

  private async buildLevels(
    range: TrackQueryRange,
  ): Promise<TrackLevelsResult> {
    const [starts, ends, exits] = await Promise.all([
      this.levelStarts(range),
      this.levelEnds(range),
      this.levelExits(range),
    ]);
    const keys = new Set<string>([
      ...starts.keys(),
      ...ends.keys(),
      ...exits.keys(),
    ]);
    const rows: TrackLevelRow[] = [...keys]
      .map((key) => {
        const start = starts.get(key);
        const end = ends.get(key);
        const exit = exits.get(key);
        const win = end?.win_count ?? 0;
        const fail = end?.fail_count ?? 0;
        return {
          mode: start?.mode ?? end?.mode ?? exit?.mode ?? '',
          level: start?.level ?? end?.level ?? exit?.level ?? 0,
          start_count: start?.start_count ?? 0,
          start_users: start?.start_users ?? 0,
          win_count: win,
          fail_count: fail,
          endless_count: end?.endless_count ?? 0,
          pass_rate: ratio(win, win + fail),
          avg_duration_ms: Math.round(end?.avg_duration_ms ?? 0),
          fail_had_pair_rate: ratio(end?.fail_had_pair_count ?? 0, fail),
          avg_fail_progress: round4(end?.avg_fail_progress ?? 0),
          next_count: exit?.next_count ?? 0,
          replay_count: exit?.replay_count ?? 0,
          home_count: exit?.home_count ?? 0,
          go_build_count: exit?.go_build_count ?? 0,
        };
      })
      .filter((row) => row.mode && row.level > 0)
      .sort((a, b) => a.mode.localeCompare(b.mode) || a.level - b.level)
      .slice(0, 200);

    return { range: this.meta(range), rows };
  }

  private async buildAds(range: TrackQueryRange): Promise<TrackAdsResult> {
    const [shows, clicks, results] = await Promise.all([
      this.adCounts(range, 'ad_entrance_show'),
      this.adCounts(range, 'ad_click'),
      this.adResults(range),
    ]);
    const scenes = new Set<string>([
      ...shows.keys(),
      ...clicks.keys(),
      ...results.keys(),
    ]);
    const rows = [...scenes]
      .filter((scene) => scene)
      .sort()
      .map((scene) =>
        this.toAdRow(
          scene,
          shows.get(scene) ?? 0,
          clicks.get(scene) ?? 0,
          results.get(scene),
        ),
      );
    const overall = rows.reduce(
      (acc, row) => ({
        scene: 'all',
        show: acc.show + row.show,
        click: acc.click + row.click,
        completed: acc.completed + row.completed,
        skipped: acc.skipped + row.skipped,
        error: acc.error + row.error,
        simulated: acc.simulated + row.simulated,
        ctr: 0,
        complete_rate: 0,
      }),
      this.toAdRow('all', 0, 0),
    );
    overall.ctr = ratio(overall.click, overall.show);
    overall.complete_rate = ratio(
      overall.completed,
      overall.completed + overall.skipped + overall.error,
    );

    return {
      range: this.meta(range),
      overall,
      scenes: rows,
    };
  }

  private async buildPages(range: TrackQueryRange): Promise<TrackPagesResult> {
    const [pages, building, shop, goBuild, next, replay, home, homeMid, goBuildEvt] =
      await Promise.all([
        this.pageViews(range),
        this.eventStats(range, 'building_light'),
        this.eventStats(range, 'shop_buy'),
        this.eventStats(range, 'level_go_build', [], true),
        this.eventStats(range, 'level_next', [], true),
        this.eventStats(range, 'level_replay', [], true),
        this.eventStats(range, 'level_home', [], true),
        this.eventStats(range, 'level_home', [this.jsonTrue('mid_run')], true),
        this.eventStats(range, 'level_go_build', [], true),
      ]);

    return {
      range: this.meta(range),
      pages,
      economy: {
        building_light: building,
        shop_buy: shop,
        go_build: goBuild,
      },
      settlement: {
        next,
        replay,
        home,
        home_mid_run: homeMid,
        go_build: goBuildEvt,
      },
    };
  }

  private withModeResult(
    step: FunnelStepDef,
    range: TrackQueryRange,
  ): FunnelStepDef {
    if (step.id !== 'level_win' || range.mode !== 'endless') {
      return step;
    }
    return { ...step, label: '对局结束', result: 'endless' };
  }

  private async funnelUsers(
    range: TrackQueryRange,
    step: FunnelStepDef,
  ): Promise<DayUser[]> {
    const extras: ExtraClause[] = [];
    if (step.pageId) extras.push(this.propEq('page_id', step.pageId));
    if (step.result) extras.push(this.propEq('result', step.result));
    const { sql, values } = this.where(range, extras, step.applyMode);
    const rows = await this.query<SqlRow>(
      `SELECT DATE_FORMAT(event_time, '%Y-%m-%d') AS day, user_id
       FROM cat_world_track_event
       WHERE name = ? AND user_id <> '' AND ${sql}
       GROUP BY DATE_FORMAT(event_time, '%Y-%m-%d'), user_id`,
      [step.name, ...values],
    );
    return rows.map((row) => ({
      day: toDayString(row.day),
      userId: String(row.user_id ?? ''),
    }));
  }

  private async countDailyUsers(
    range: TrackQueryRange,
    name: string,
    extras: ExtraClause[] = [],
    applyMode = false,
  ): Promise<Map<string, number>> {
    const { sql, values } = this.where(range, extras, applyMode);
    const rows = await this.query<SqlRow>(
      `SELECT DATE_FORMAT(event_time, '%Y-%m-%d') AS day, COUNT(DISTINCT user_id) AS users
       FROM cat_world_track_event
       WHERE name = ? AND user_id <> '' AND ${sql}
       GROUP BY DATE_FORMAT(event_time, '%Y-%m-%d')`,
      [name, ...values],
    );
    return this.numberMap(rows, 'day', 'users', true);
  }

  private async countUniqueUsers(
    range: TrackQueryRange,
    name: string,
    extras: ExtraClause[] = [],
    applyMode = false,
  ): Promise<number> {
    const { sql, values } = this.where(range, extras, applyMode);
    const rows = await this.query<SqlRow>(
      `SELECT COUNT(DISTINCT user_id) AS users
       FROM cat_world_track_event
       WHERE name = ? AND user_id <> '' AND ${sql}`,
      [name, ...values],
    );
    return toNumber(rows[0]?.users);
  }

  private async countEvents(
    range: TrackQueryRange,
    name: string,
    extras: ExtraClause[] = [],
    applyMode = false,
  ): Promise<number> {
    const { sql, values } = this.where(range, extras, applyMode);
    const rows = await this.query<SqlRow>(
      `SELECT COUNT(*) AS total
       FROM cat_world_track_event
       WHERE name = ? AND ${sql}`,
      [name, ...values],
    );
    return toNumber(rows[0]?.total);
  }

  private async eventStats(
    range: TrackQueryRange,
    name: string,
    extras: ExtraClause[] = [],
    applyMode = false,
  ): Promise<{ events: number; users: number }> {
    const { sql, values } = this.where(range, extras, applyMode);
    const rows = await this.query<SqlRow>(
      `SELECT COUNT(*) AS events, COUNT(DISTINCT CASE WHEN user_id <> '' THEN user_id END) AS users
       FROM cat_world_track_event
       WHERE name = ? AND ${sql}`,
      [name, ...values],
    );
    return {
      events: toNumber(rows[0]?.events),
      users: toNumber(rows[0]?.users),
    };
  }

  private async loadingDuration(range: TrackQueryRange): Promise<{
    avg_ms: number;
    p50_ms: number;
    p90_ms: number;
    samples: number;
  }> {
    const { sql, values } = this.where(range);
    const rows = await this.query<SqlRow>(
      `SELECT
         AVG(duration_ms) AS avg_ms,
         MAX(CASE WHEN rn = p50_idx THEN duration_ms END) AS p50_ms,
         MAX(CASE WHEN rn = p90_idx THEN duration_ms END) AS p90_ms,
         MAX(n) AS samples
       FROM (
         SELECT
           duration_ms,
           ROW_NUMBER() OVER (ORDER BY duration_ms) AS rn,
           COUNT(*) OVER () AS n,
           GREATEST(1, FLOOR((COUNT(*) OVER () + 1) * 0.5)) AS p50_idx,
           GREATEST(1, FLOOR((COUNT(*) OVER () + 1) * 0.9)) AS p90_idx
         FROM (
           SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(props, '$.duration_ms')) AS UNSIGNED) AS duration_ms
           FROM cat_world_track_event
           WHERE name = 'loading_finish' AND ${sql}
         ) raw
         WHERE duration_ms > 0
       ) ranked`,
      values,
    );
    return {
      avg_ms: Math.round(toNumber(rows[0]?.avg_ms)),
      p50_ms: Math.round(toNumber(rows[0]?.p50_ms)),
      p90_ms: Math.round(toNumber(rows[0]?.p90_ms)),
      samples: toNumber(rows[0]?.samples),
    };
  }

  private async levelStarts(range: TrackQueryRange) {
    const { sql, values } = this.where(range, [], true);
    const rows = await this.query<SqlRow>(
      `SELECT
         JSON_UNQUOTE(JSON_EXTRACT(props, '$.mode')) AS mode,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(props, '$.level')) AS SIGNED) AS level,
         COUNT(*) AS start_count,
         COUNT(DISTINCT CASE WHEN user_id <> '' THEN user_id END) AS start_users
       FROM cat_world_track_event
       WHERE name = 'level_start' AND ${sql}
       GROUP BY mode, level`,
      values,
    );
    const map = new Map<
      string,
      { mode: string; level: number; start_count: number; start_users: number }
    >();
    for (const row of rows) {
      const mode = String(row.mode ?? '');
      const level = toNumber(row.level);
      if (!mode || level <= 0) continue;
      map.set(this.levelKey(mode, level), {
        mode,
        level,
        start_count: toNumber(row.start_count),
        start_users: toNumber(row.start_users),
      });
    }
    return map;
  }

  private async levelEnds(range: TrackQueryRange) {
    const { sql, values } = this.where(range, [], true);
    const rows = await this.query<SqlRow>(
      `SELECT
         JSON_UNQUOTE(JSON_EXTRACT(props, '$.mode')) AS mode,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(props, '$.level')) AS SIGNED) AS level,
         SUM(JSON_UNQUOTE(JSON_EXTRACT(props, '$.result')) = 'win') AS win_count,
         SUM(JSON_UNQUOTE(JSON_EXTRACT(props, '$.result')) = 'fail') AS fail_count,
         SUM(JSON_UNQUOTE(JSON_EXTRACT(props, '$.result')) = 'endless') AS endless_count,
         AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(props, '$.duration_ms')) AS UNSIGNED)) AS avg_duration_ms,
         AVG(CASE
           WHEN JSON_UNQUOTE(JSON_EXTRACT(props, '$.result')) = 'fail'
           THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(props, '$.fail_progress')) AS DECIMAL(10, 4))
         END) AS avg_fail_progress,
         SUM(CASE
           WHEN JSON_UNQUOTE(JSON_EXTRACT(props, '$.result')) = 'fail'
            AND JSON_EXTRACT(props, '$.fail_had_pair') = CAST('true' AS JSON)
           THEN 1 ELSE 0
         END) AS fail_had_pair_count
       FROM cat_world_track_event
       WHERE name = 'level_end' AND ${sql}
       GROUP BY mode, level`,
      values,
    );
    const map = new Map<
      string,
      {
        mode: string;
        level: number;
        win_count: number;
        fail_count: number;
        endless_count: number;
        avg_duration_ms: number;
        avg_fail_progress: number;
        fail_had_pair_count: number;
      }
    >();
    for (const row of rows) {
      const mode = String(row.mode ?? '');
      const level = toNumber(row.level);
      if (!mode || level <= 0) continue;
      map.set(this.levelKey(mode, level), {
        mode,
        level,
        win_count: toNumber(row.win_count),
        fail_count: toNumber(row.fail_count),
        endless_count: toNumber(row.endless_count),
        avg_duration_ms: toNumber(row.avg_duration_ms),
        avg_fail_progress: toNumber(row.avg_fail_progress),
        fail_had_pair_count: toNumber(row.fail_had_pair_count),
      });
    }
    return map;
  }

  private async levelExits(range: TrackQueryRange) {
    const { sql, values } = this.where(range, [], true);
    const rows = await this.query<SqlRow>(
      `SELECT
         JSON_UNQUOTE(JSON_EXTRACT(props, '$.mode')) AS mode,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(props, '$.level')) AS SIGNED) AS level,
         SUM(name = 'level_next') AS next_count,
         SUM(name = 'level_replay') AS replay_count,
         SUM(name = 'level_home') AS home_count,
         SUM(name = 'level_go_build') AS go_build_count
       FROM cat_world_track_event
       WHERE name IN ('level_next', 'level_replay', 'level_home', 'level_go_build')
         AND ${sql}
       GROUP BY mode, level`,
      values,
    );
    const map = new Map<
      string,
      {
        mode: string;
        level: number;
        next_count: number;
        replay_count: number;
        home_count: number;
        go_build_count: number;
      }
    >();
    for (const row of rows) {
      const mode = String(row.mode ?? '');
      const level = toNumber(row.level);
      if (!mode || level <= 0) continue;
      map.set(this.levelKey(mode, level), {
        mode,
        level,
        next_count: toNumber(row.next_count),
        replay_count: toNumber(row.replay_count),
        home_count: toNumber(row.home_count),
        go_build_count: toNumber(row.go_build_count),
      });
    }
    return map;
  }

  private async adCounts(range: TrackQueryRange, name: string) {
    const { sql, values } = this.where(range);
    const rows = await this.query<SqlRow>(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(props, '$.scene')) AS scene, COUNT(*) AS total
       FROM cat_world_track_event
       WHERE name = ? AND ${sql}
       GROUP BY scene`,
      [name, ...values],
    );
    return this.numberMap(rows, 'scene', 'total', false);
  }

  private async adResults(range: TrackQueryRange) {
    const { sql, values } = this.where(range);
    const rows = await this.query<SqlRow>(
      `SELECT
         JSON_UNQUOTE(JSON_EXTRACT(props, '$.scene')) AS scene,
         SUM(JSON_UNQUOTE(JSON_EXTRACT(props, '$.result')) = 'completed') AS completed,
         SUM(JSON_UNQUOTE(JSON_EXTRACT(props, '$.result')) = 'skipped') AS skipped,
         SUM(JSON_UNQUOTE(JSON_EXTRACT(props, '$.result')) = 'error') AS error_count,
         SUM(JSON_UNQUOTE(JSON_EXTRACT(props, '$.result')) = 'simulated') AS simulated
       FROM cat_world_track_event
       WHERE name = 'ad_result' AND ${sql}
       GROUP BY scene`,
      values,
    );
    const map = new Map<
      string,
      { completed: number; skipped: number; error: number; simulated: number }
    >();
    for (const row of rows) {
      const scene = String(row.scene ?? '');
      map.set(scene, {
        completed: toNumber(row.completed),
        skipped: toNumber(row.skipped),
        error: toNumber(row.error_count),
        simulated: toNumber(row.simulated),
      });
    }
    return map;
  }

  private async pageViews(range: TrackQueryRange) {
    const { sql, values } = this.where(range);
    const rows = await this.query<SqlRow>(
      `SELECT
         JSON_UNQUOTE(JSON_EXTRACT(props, '$.page_id')) AS page_id,
         COUNT(*) AS views,
         COUNT(DISTINCT CASE WHEN user_id <> '' THEN user_id END) AS users
       FROM cat_world_track_event
       WHERE name = 'page_view' AND ${sql}
       GROUP BY page_id
       ORDER BY views DESC`,
      values,
    );
    return rows
      .map((row) => ({
        page_id: String(row.page_id ?? ''),
        views: toNumber(row.views),
        users: toNumber(row.users),
      }))
      .filter((row) => row.page_id);
  }

  private toAdRow(
    scene: string,
    show: number,
    click: number,
    result?: { completed: number; skipped: number; error: number; simulated: number },
  ): TrackAdRow {
    const completed = result?.completed ?? 0;
    const skipped = result?.skipped ?? 0;
    const error = result?.error ?? 0;
    const simulated = result?.simulated ?? 0;
    return {
      scene,
      show,
      click,
      completed,
      skipped,
      error,
      simulated,
      ctr: ratio(click, show),
      complete_rate: ratio(completed, completed + skipped + error),
    };
  }

  private where(
    range: TrackQueryRange,
    extras: ExtraClause[] = [],
    applyMode = false,
  ): { sql: string; values: unknown[] } {
    const parts = ['event_time >= ?', 'event_time < ?'];
    const values: unknown[] = [range.fromStart, range.toExclusive];
    if (range.platform !== 'all') {
      parts.push('platform = ?');
      values.push(range.platform);
    }
    if (applyMode && range.mode !== 'all') {
      parts.push("JSON_UNQUOTE(JSON_EXTRACT(props, '$.mode')) = ?");
      values.push(range.mode);
    }
    for (const extra of extras) {
      parts.push(extra.sql);
      if (extra.values) values.push(...extra.values);
    }
    return { sql: parts.join(' AND '), values };
  }

  private propEq(key: string, value: string): ExtraClause {
    return {
      sql: `JSON_UNQUOTE(JSON_EXTRACT(props, '$.${key}')) = ?`,
      values: [value],
    };
  }

  private jsonTrue(key: string): ExtraClause {
    return {
      sql: `JSON_EXTRACT(props, '$.${key}') = CAST('true' AS JSON)`,
    };
  }

  private fillDaily(
    map: Map<string, { dau: number; new_users: number; start_users: number; win_users: number }>,
    values: Map<string, number>,
    key: 'dau' | 'new_users' | 'start_users' | 'win_users',
  ) {
    for (const [day, value] of values) {
      const row = map.get(day);
      if (row) row[key] = value;
    }
  }

  private numberMap(
    rows: SqlRow[],
    keyField: string,
    valueField: string,
    asDay: boolean,
  ) {
    const map = new Map<string, number>();
    for (const row of rows) {
      const key = asDay
        ? toDayString(row[keyField])
        : String(row[keyField] ?? '');
      if (!key || key === 'null') continue;
      map.set(key, toNumber(row[valueField]));
    }
    return map;
  }

  private levelKey(mode: string, level: number): string {
    return `${mode}:${level}`;
  }

  private meta(range: TrackQueryRange): TrackRangeMeta {
    return {
      from: range.from,
      to: range.to,
      platform: range.platform,
      mode: range.mode,
    };
  }

  private query<T extends SqlRow>(sql: string, values: unknown[]): Promise<T[]> {
    return this.events.query(sql, values) as Promise<T[]>;
  }
}
