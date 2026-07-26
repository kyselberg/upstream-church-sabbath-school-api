import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  telegramGroupChatId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  reminderWeekday?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  reminderHour?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  reminderMinute?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinWeekly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  undoWindowMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  llmProvider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  llmModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  llmApiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  llmBaseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  botLocale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  churchInfo?: string;
}
