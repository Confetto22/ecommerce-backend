import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteImageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  publicId: string;
}
