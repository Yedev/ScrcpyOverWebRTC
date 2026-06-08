import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { UserRole } from '../user.model';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: UserRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedDevices?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;
}
