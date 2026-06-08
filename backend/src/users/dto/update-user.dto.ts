import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../user.model';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password?: string;

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
