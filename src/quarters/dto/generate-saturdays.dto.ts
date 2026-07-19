import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class GenerateSaturdaysDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoFill?: boolean;
}
