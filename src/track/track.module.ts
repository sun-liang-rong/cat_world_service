import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardAuthGuard } from './dashboard-auth.guard';
import { TrackEvent } from './entities/track-event.entity';
import { TrackController } from './track.controller';
import { TrackDashboardController } from './track-dashboard.controller';
import { TrackDashboardService } from './track-dashboard.service';
import { TrackService } from './track.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrackEvent])],
  controllers: [TrackController, TrackDashboardController],
  providers: [TrackService, TrackDashboardService, DashboardAuthGuard],
})
export class TrackModule {}
