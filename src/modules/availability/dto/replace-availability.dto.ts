import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateAvailabilityRuleDto } from './create-availability.dto';

export class ReplaceAvailabilityDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAvailabilityRuleDto)
  rules: CreateAvailabilityRuleDto[];
}
