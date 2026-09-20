import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class QueryTrackDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['wechat', 'preview', 'all'])
  platform?: 'wechat' | 'preview' | 'all';

  @IsOptional()
  @IsIn(['main', 'challenge', 'endless', 'all'])
  mode?: 'main' | 'challenge' | 'endless' | 'all';
}
