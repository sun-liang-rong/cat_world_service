import { Body, Controller, Post } from '@nestjs/common';
import { TrackBatchDto } from './dto/track-batch.dto';
import { TrackIngestResult, TrackService } from './track.service';

@Controller('track')
export class TrackController {
  constructor(private readonly trackService: TrackService) {}

  @Post()
  ingest(@Body() dto: TrackBatchDto): Promise<TrackIngestResult> {
    return this.trackService.ingest(dto);
  }
}
