import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsUUID, ValidateNested } from 'class-validator';

class BulkAssignItemDto {
  @ApiProperty()
  @IsUUID()
  assignmentId!: string;

  @ApiProperty()
  @IsUUID()
  memberId!: string;
}

export class BulkAssignDto {
  @ApiProperty({ type: [BulkAssignItemDto] })
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BulkAssignItemDto)
  items!: BulkAssignItemDto[];
}
