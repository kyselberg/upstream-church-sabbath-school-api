import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetPrimaryDto {
  @ApiProperty()
  @IsBoolean()
  isPrimary!: boolean;
}
