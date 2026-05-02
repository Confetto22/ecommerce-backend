import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Single source of truth for password rules across signup, password reset,
 * and any other endpoint that accepts a new password from the user.
 *
 * Rules: 8–72 chars (72 = bcrypt max byte length), at least one lowercase,
 * one uppercase, one digit, one symbol from the allowed set.
 */
export function IsValidPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(8, { message: 'Password must be at least 8 characters long' }),
    MaxLength(72, { message: 'Password must be at most 72 characters long' }),
    Matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+=\-{}[\]:;"'<>,.?/\\|`~])[\S]+$/,
      {
        message:
          'Password must contain an uppercase letter, a lowercase letter, a digit, and a special character',
      },
    ),
  );
}
