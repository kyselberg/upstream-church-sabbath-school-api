import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class UndoDto {
  @ApiProperty()
  @Matches(/^(change|swap):.+$/)
  ref!: string;
}
