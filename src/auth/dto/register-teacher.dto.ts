import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class RegisterTeacherDto {
  @IsEmail()
  email: string; // must match ALLOWED_SCHOOL_EMAIL_DOMAINS, checked in service layer

  @IsString()
  @MinLength(8)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must contain uppercase, lowercase, and a number or symbol',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  employeeNumber: string;

  @IsString()
  @IsNotEmpty()
  nationalId: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  schoolId: string;
}
