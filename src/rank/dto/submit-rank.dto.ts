import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { RankType } from '../rank-type';

export class SubmitRankDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  user_id: string;

  @Type(() => Number)
  @IsEnum(RankType)
  type: RankType;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  level_count?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  star_count?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  clear_count?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration_ms?: number;
}
