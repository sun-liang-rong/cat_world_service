import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TrackEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  event_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  ts: number;

  @IsOptional()
  @IsObject()
  props?: Record<string, unknown>;
}

export class TrackBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  user_id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  session_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  app_version?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TrackEventDto)
  events: TrackEventDto[];
}
