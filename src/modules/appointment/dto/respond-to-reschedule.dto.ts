import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export enum RescheduleAction {
  ACCEPT = 'ACCEPT',
  COUNTER = 'COUNTER',
  CANCEL = 'CANCEL',
}

export class RespondToRescheduleDto {
  @IsEnum(RescheduleAction)
  action: RescheduleAction;

  /** Required when action is COUNTER — the patient's counter-proposal. */
  @ValidateIf((o) => o.action === RescheduleAction.COUNTER)
  @IsDateString()
  proposedStartAt?: string;

  /** Required when action is COUNTER. */
  @ValidateIf((o) => o.action === RescheduleAction.COUNTER)
  @IsDateString()
  proposedEndAt?: string;

  /** Optional reason when action is CANCEL. */
  @ValidateIf((o) => o.action === RescheduleAction.CANCEL)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
