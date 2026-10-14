import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { QueryRankDto } from './dto/query-rank.dto';
import { SubmitRankDto } from './dto/submit-rank.dto';
import { RankEntry, RankService, SubmitRankResult } from './rank.service';

@Controller('rank')
export class RankController {
  constructor(private readonly rankService: RankService) {}

  @Post('submit')
  submit(
    @Body() dto: SubmitRankDto,
    @Headers('authorization') authorization?: string,
  ): Promise<SubmitRankResult> {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? '')?.[1] ?? '';
    return this.rankService.submit(dto, token);
  }

  @Get('list')
  list(@Query() query: QueryRankDto): Promise<RankEntry[]> {
    return this.rankService.list(query);
  }
}
