import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class LinkTelegramDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty()
  @IsInt()
  tgUserId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tgUsername?: string;
}

export class ClassDateDto {
  @ApiProperty()
  @IsUUID()
  classId!: string;

  @ApiProperty()
  @Matches(DATE_RE)
  date!: string;
}

export class ReassignInternalDto extends ClassDateDto {
  @ApiProperty()
  @IsUUID()
  toMemberId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorMemberId?: string | null;
}

export class SubstituteInternalDto extends ClassDateDto {
  @ApiProperty()
  @IsUUID()
  substituteMemberId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorMemberId?: string | null;
}

export class SwapInternalDto {
  @ApiProperty({ type: ClassDateDto })
  @ValidateNested()
  @Type(() => ClassDateDto)
  a!: ClassDateDto;

  @ApiProperty({ type: ClassDateDto })
  @ValidateNested()
  @Type(() => ClassDateDto)
  b!: ClassDateDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorMemberId?: string | null;
}

export class MarkUnavailableInternalDto extends ClassDateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorMemberId?: string | null;
}

export class UndoInternalDto {
  @ApiProperty()
  @Matches(/^(change|swap):.+$/)
  ref!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  byMemberId?: string | null;
}

export class AgentLogClaimDto {
  @ApiProperty()
  @IsInt()
  updateId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  telegramUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  chatId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;
}

export class AgentLogFinishDto {
  @ApiProperty()
  @IsInt()
  updateId!: number;

  @ApiProperty({ type: [Object] })
  @IsArray()
  calls!: Array<{
    toolName?: string;
    toolArgs?: unknown;
    result?: unknown;
    changeId?: string;
  }>;
}

export class RemindersClaimDto {
  @ApiProperty()
  @IsIn(['weekly_reminder'])
  type!: 'weekly_reminder';

  @ApiProperty()
  @Matches(DATE_RE)
  targetDate!: string;
}

export class RemindersSentDto {
  @ApiProperty()
  @IsInt()
  messageId!: number;
}

export class LoginLinkInternalDto {
  @ApiProperty()
  @IsInt()
  telegramUserId!: number;
}
