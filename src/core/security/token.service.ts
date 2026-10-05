import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import { AppConfigService } from '../config/config.service';
import { AuthenticationError } from '../errors/app-error';

export interface JwtPayload {
  sub: string; // User ID
  email: string;
  tenantId?: string;
  roleCode?: string;
  permissions?: string[];
  type: 'access' | 'refresh';
  jti?: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly config: AppConfigService) {}

  generateAccessToken(payload: Omit<JwtPayload, 'type'>): string {
    return jwt.sign({ ...payload, type: 'access' }, this.config.get('JWT_SECRET'), {
      expiresIn: this.config.get('JWT_EXPIRES_IN') as jwt.SignOptions['expiresIn'],
    });
  }

  generateRefreshToken(userId: string): string {
    return jwt.sign(
      { sub: userId, jti: uuidv4(), type: 'refresh' },
      this.config.get('JWT_REFRESH_SECRET'),
      { expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') as jwt.SignOptions['expiresIn'] },
    );
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.config.get('JWT_SECRET')) as JwtPayload;
      if (decoded.type !== 'access') {
        throw new AuthenticationError('Invalid token type: expected access token');
      }
      return decoded;
    } catch (err) {
      throw new AuthenticationError(err instanceof Error ? err.message : 'Invalid token');
    }
  }

  verifyRefreshToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.config.get('JWT_REFRESH_SECRET')) as JwtPayload;
      if (decoded.type !== 'refresh') {
        throw new AuthenticationError('Invalid token type: expected refresh token');
      }
      return decoded;
    } catch (err) {
      throw new AuthenticationError(err instanceof Error ? err.message : 'Invalid refresh token');
    }
  }
}
