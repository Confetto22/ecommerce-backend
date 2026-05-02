import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class UploadImageDto {
  @IsOptional()
  @IsString({ message: 'Folder must be a valid text' })
  folder?: string;

  @IsOptional()
  @IsString({ message: 'Public ID must be a valid text' })
  publicId?: string;

  @IsOptional()
  @IsBoolean({ message: 'Overwrite must be a boolean value' })
  overwrite?: boolean;
}
