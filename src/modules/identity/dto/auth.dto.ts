import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Valid email required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(150),
});

export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required'),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthResponseDto {
  user: {
    id: string;
    email: string;
    fullName: string;
  };
  tokens: AuthTokens;
}

export const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email required').max(255),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(150).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100).optional(),
});

export type AcceptInviteDto = z.infer<typeof acceptInviteSchema>;
