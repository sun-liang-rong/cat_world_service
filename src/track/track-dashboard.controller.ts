import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QueryTrackDto } from './dto/query-track.dto';
import { DashboardAuthGuard } from './dashboard-auth.guard';
import {
  TrackAdsResult,
  TrackDashboardResult,
  TrackDashboardService,
  TrackFunnelResult,
  TrackLevelsResult,
  TrackOverviewResult,
  TrackPagesResult,
} from './track-dashboard.service';

@Controller('track')
@UseGuards(DashboardAuthGuard)
export class TrackDashboardController {
  constructor(private readonly dashboard: TrackDashboardService) {}

  @Get('dashboard')
  dashboardAll(@Query() query: QueryTrackDto): Promise<TrackDashboardResult> {
    return this.dashboard.dashboard(query);
  }

  @Get('overview')
  overview(@Query() query: QueryTrackDto): Promise<TrackOverviewResult> {
    return this.dashboard.overview(query);
  }

  @Get('funnel')
  funnel(@Query() query: QueryTrackDto): Promise<TrackFunnelResult> {
    return this.dashboard.funnel(query);
  }

  @Get('levels')
  levels(@Query() query: QueryTrackDto): Promise<TrackLevelsResult> {
    return this.dashboard.levels(query);
  }

  @Get('ads')
  ads(@Query() query: QueryTrackDto): Promise<TrackAdsResult> {
    return this.dashboard.ads(query);
  }

  @Get('pages')
  pages(@Query() query: QueryTrackDto): Promise<TrackPagesResult> {
    return this.dashboard.pages(query);
  }
}
