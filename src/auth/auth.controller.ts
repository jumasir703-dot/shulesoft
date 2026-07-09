import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SystemRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto, RequestPasswordResetDto, ResetPasswordDto, VerifyEmailDto } from './dto/misc.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RefreshJwtAuthGuard } from '../common/guards/refresh-jwt.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register/teacher')
  registerTeacher(@Body() dto: RegisterTeacherDto) {
    return this.authService.registerTeacher(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, { ip: req.ip });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RefreshJwtAuthGuard)
  refresh(@Req() req: Request & { user: AuthenticatedUser & { refreshTokenRecordId: string } }) {
    return this.authService.refreshTokens(req.user.userId, req.user.refreshTokenRecordId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: RefreshTokenDto) {
    return this.authService.logout(user.userId, dto.refreshToken);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ------------------------------------------------------------------
  // Admin-only: teacher approval queue
  // ------------------------------------------------------------------

  @Post('teachers/:userId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SCHOOL_ADMIN)
  approveTeacher(@Param('userId') userId: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.authService.approveTeacher(userId, admin.userId);
  }

  @Post('teachers/:userId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SCHOOL_ADMIN)
  rejectTeacher(@Param('userId') userId: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.authService.rejectTeacher(userId, admin.userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
