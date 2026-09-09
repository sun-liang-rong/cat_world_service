import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { QueryRankDto } from './dto/query-rank.dto';
import { SubmitRankDto } from './dto/submit-rank.dto';
import { RankEntry, RankService, SubmitRankResult } from './rank.service';

@Controller('rank')
export class RankController {
  constructor(private readonly rankService: RankService) {}

  @Post('submit')
  submit(@Body() dto: SubmitRankDto): Promise<SubmitRankResult> {
    return this.rankService.submit(dto);
  }

  @Get('list')
  list(@Query() query: QueryRankDto): Promise<RankEntry[]> {
    return this.rankService.list(query);
  }
}
