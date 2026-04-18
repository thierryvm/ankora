import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email({ message: 'auth.email.invalid' });

export const passwordSchema = z
  .string()
  .min(12, { message: 'auth.password.tooShort' })
  .max(128, { message: 'auth.password.tooLong' })
  .regex(/[a-z]/, { message: 'auth.password.lowercase' })
  .regex(/[A-Z]/, { message: 'auth.password.uppercase' })
  .regex(/[0-9]/, { message: 'auth.password.digit' });

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    acceptTos: z.literal(true, { message: 'auth.acceptTos.required' }),
    acceptPrivacy: z.literal(true, { message: 'auth.acceptPrivacy.required' }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'auth.passwordConfirm.mismatch',
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'auth.password.required' }),
});

export const passwordResetRequestSchema = z.object({ email: emailSchema });

export const passwordResetConfirmSchema = z
  .object({
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'auth.passwordConfirm.mismatch',
  });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
