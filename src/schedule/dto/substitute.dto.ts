import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SubstituteDto {
  @ApiProperty()
  @IsUUID()
  substituteMemberId!: string;
}
