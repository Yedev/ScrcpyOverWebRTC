import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: '用户名只能包含字母、数字、_.-' })
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}
