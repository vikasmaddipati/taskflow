import { z } from 'zod';

export const registerSchema = z.object({
  name: z
    .string({ required_error: 'Please provide a name' })
    .trim()
    .min(1, { message: 'Name cannot be empty' })
    .max(50, { message: 'Name cannot exceed 50 characters' }),
  email: z
    .string({ required_error: 'Please provide an email' })
    .trim()
    .email({ message: 'Please provide a valid email' }),
  password: z
    .string({ required_error: 'Please provide a password' })
    .min(8, { message: 'Password must be at least 8 characters long' })
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Please provide email' })
    .trim()
    .email({ message: 'Please provide a valid email' }),
  password: z
    .string({ required_error: 'Please provide password' })
    .min(1, { message: 'Please provide password' })
});

export const otpRequestSchema = z.object({
  email: z
    .string({ required_error: 'Please provide a valid email address' })
    .trim()
    .email({ message: 'Please provide a valid email address' })
});

export const otpVerifySchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email({ message: 'Valid email is required' }),
  otp: z
    .string({ required_error: 'Verification code is required' })
    .trim()
    .length(6, { message: 'Verification code must be 6 digits' }),
  name: z.string().trim().max(50).optional()
});

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Please provide a valid email address' })
    .trim()
    .email({ message: 'Please provide a valid email address' })
});

export const verifyResetOtpSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email({ message: 'Valid email is required' }),
  otp: z
    .string({ required_error: 'Verification code is required' })
    .trim()
    .length(6, { message: 'Verification code must be 6 digits' })
});

export const resetPasswordSchema = z.object({
  token: z
    .string({ required_error: 'Reset token is required' })
    .trim()
    .min(1, { message: 'Reset token is required' }),
  newPassword: z
    .string({ required_error: 'New password is required' })
    .min(8, { message: 'Password must be at least 8 characters long' })
});
