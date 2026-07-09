import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AccountStatus, SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { LoginDto } from './dto/login.dto';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  // --------------------------------------------------------------------
  // TEACHER REGISTRATION
  // --------------------------------------------------------------------

  async registerTeacher(dto: RegisterTeacherDto) {
    this.assertAllowedSchoolEmailDomain(dto.email);

    const school = await this.prisma.school.findUnique({ where: { id: dto.schoolId } });
    if (!school || !school.isActive) {
      throw new BadRequestException('Invalid or inactive school');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          role: SystemRole.TEACHER,
          status: AccountStatus.PENDING,
          schoolId: dto.schoolId,
          teacherProfile: {
            create: {
              fullName: dto.fullName,
              employeeNumber: dto.employeeNumber,
              nationalId: dto.nationalId,
              phone: dto.phone,
            },
          },
        },
        include: { teacherProfile: true },
      });

      await tx.auditLog.create({
        data: {
          schoolId: dto.schoolId,
          userId: createdUser.id,
          action: 'CREATE',
          entityType: 'Teacher',
          entityId: createdUser.id,
        },
      });

      return createdUser;
    });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        token: verificationToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });

    await this.mail.sendEmailVerification(user.email, dto.fullName, verificationToken);

    return {
      message:
        'Registration received. Check your email to verify your address, then wait for admin approval.',
      userId: user.id,
    };
  }

  private assertAllowedSchoolEmailDomain(email: string) {
    const allowed = (this.config.get<string>('ALLOWED_SCHOOL_EMAIL_DOMAINS') ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    if (allowed.length === 0) return; // not configured -> skip check

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain || !allowed.includes(domain)) {
      throw new BadRequestException('You must register with your official school email address');
    }
  }

  // --------------------------------------------------------------------
  // EMAIL VERIFICATION
  // --------------------------------------------------------------------

  async verifyEmail(token: string) {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: { include: { teacherProfile: true } } },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification link');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { isEmailVerified: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Teachers still need admin approval after verifying their email.
    if (record.user.role === SystemRole.TEACHER && record.user.teacherProfile) {
      await this.mail.sendTeacherPendingApprovalNotice(
        record.user.email,
        record.user.teacherProfile.fullName,
      );
    }

    return { message: 'Email verified successfully' };
  }

  // --------------------------------------------------------------------
  // ADMIN APPROVAL OF TEACHER ACCOUNTS
  // --------------------------------------------------------------------

  async approveTeacher(teacherUserId: string, approvingAdminUserId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: approvingAdminUserId } });
    if (!admin || admin.role !== SystemRole.SCHOOL_ADMIN) {
      throw new ForbiddenException('Only a school admin can approve teachers');
    }

    const teacherUser = await this.prisma.user.findUnique({
      where: { id: teacherUserId },
      include: { teacherProfile: true },
    });

    if (!teacherUser || teacherUser.role !== SystemRole.TEACHER) {
      throw new NotFoundException('Teacher account not found');
    }

    if (teacherUser.schoolId !== admin.schoolId) {
      throw new ForbiddenException('You can only approve teachers in your own school');
    }

    if (!teacherUser.isEmailVerified) {
      throw new BadRequestException('Teacher must verify their email before approval');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: teacherUserId },
        data: { status: AccountStatus.ACTIVE },
      });

      if (teacherUser.teacherProfile) {
        await tx.teacher.update({
          where: { id: teacherUser.teacherProfile.id },
          data: { approvedAt: new Date(), approvedById: approvingAdminUserId },
        });
      }

      await tx.auditLog.create({
        data: {
          schoolId: admin.schoolId,
          userId: approvingAdminUserId,
          action: 'ACCOUNT_APPROVED',
          entityType: 'Teacher',
          entityId: teacherUserId,
        },
      });
    });

    if (teacherUser.teacherProfile) {
      await this.mail.sendTeacherApprovedNotice(teacherUser.email, teacherUser.teacherProfile.fullName);
    }

    return { message: 'Teacher approved' };
  }

  async rejectTeacher(teacherUserId: string, approvingAdminUserId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: approvingAdminUserId } });
    if (!admin || admin.role !== SystemRole.SCHOOL_ADMIN) {
      throw new ForbiddenException('Only a school admin can reject teachers');
    }

    const teacherUser = await this.prisma.user.findUnique({ where: { id: teacherUserId } });
    if (!teacherUser || teacherUser.schoolId !== admin.schoolId) {
      throw new NotFoundException('Teacher account not found');
    }

    await this.prisma.user.update({
      where: { id: teacherUserId },
      data: { status: AccountStatus.REJECTED },
    });

    return { message: 'Teacher registration rejected' };
  }

  // --------------------------------------------------------------------
  // LOGIN / TOKENS
  // --------------------------------------------------------------------

  async login(dto: LoginDto, meta?: { ip?: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException('Please verify your email before logging in');
    }

    if (user.status === AccountStatus.PENDING) {
      throw new ForbiddenException('Your account is pending admin approval');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Your account is not active. Contact your administrator.');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role, user.schoolId);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      this.prisma.auditLog.create({
        data: {
          schoolId: user.schoolId,
          userId: user.id,
          action: 'LOGIN',
          ipAddress: meta?.ip,
        },
      }),
    ]);

    return {
      ...tokens,
      user: { id: user.id, email: user.email, role: user.role, schoolId: user.schoolId },
    };
  }

  async refreshTokens(userId: string, oldRefreshTokenRecordId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Rotate: revoke the old refresh token, issue a new pair
    await this.prisma.refreshToken.update({
      where: { id: oldRefreshTokenRecordId },
      data: { revoked: true },
    });

    return this.issueTokens(user.id, user.email, user.role, user.schoolId);
  }

  async logout(userId: string, refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, token: refreshToken },
      data: { revoked: true },
    });
    return { message: 'Logged out' };
  }

  private async issueTokens(userId: string, email: string, role: string, schoolId: string | null) {
    const payload = { sub: userId, email, role, schoolId };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // keep in sync with JWT_REFRESH_EXPIRES_IN

    await this.prisma.refreshToken.create({
      data: { token: refreshToken, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  // --------------------------------------------------------------------
  // PASSWORD RESET
  // --------------------------------------------------------------------

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { teacherProfile: true, studentProfile: true, parentProfile: true, adminProfile: true },
    });

    // Always return a generic success message to avoid leaking which emails are registered.
    if (!user) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const name =
      user.teacherProfile?.fullName ??
      user.studentProfile?.fullName ??
      user.parentProfile?.fullName ??
      user.adminProfile?.fullName ??
      'there';

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }, // 1h
    });

    await this.mail.sendPasswordReset(user.email, name, token);

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { token } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Revoke all existing refresh tokens on password change for safety
      this.prisma.refreshToken.updateMany({ where: { userId: record.userId }, data: { revoked: true } }),
      this.prisma.auditLog.create({
        data: { userId: record.userId, action: 'PASSWORD_RESET' },
      }),
    ]);

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }
}
