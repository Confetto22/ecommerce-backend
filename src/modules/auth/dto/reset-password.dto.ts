import { IsString, Length } from 'class-validator';

import { IsValidPassword } from 'src/common/validators/is-valid-password.decorator';

export class ResetPasswordDto {
  /** Hex-encoded raw token from the reset email (32 random bytes -> 64 chars). */
  @IsString()
  @Length(64, 64)
  token: string;

  @IsValidPassword()
  password: string;
}
