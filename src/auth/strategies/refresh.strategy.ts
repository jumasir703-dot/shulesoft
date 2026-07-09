import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET') as string,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const rawToken = req.body?.refreshToken;

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: rawToken },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      schoolId: payload.schoolId,
      refreshTokenRecordId: stored.id,
    };
  }
}
