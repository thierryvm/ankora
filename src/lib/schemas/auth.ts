import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: 'Adresse email invalide' });

export const passwordSchema = z
  .string()
  .min(12, { message: 'Au moins 12 caractères' })
  .max(128, { message: 'Maximum 128 caractères' })
  .regex(/[a-z]/, { message: 'Au moins une minuscule' })
  .regex(/[A-Z]/, { message: 'Au moins une majuscule' })
  .regex(/[0-9]/, { message: 'Au moins un chiffre' });

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    acceptTos: z.literal(true, { message: 'Tu dois accepter les CGU' }),
    acceptPrivacy: z.literal(true, { message: 'Tu dois accepter la politique' }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Les mots de passe ne correspondent pas',
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Mot de passe requis' }),
});

export const passwordResetRequestSchema = z.object({ email: emailSchema });

export const passwordResetConfirmSchema = z
  .object({
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Les mots de passe ne correspondent pas',
  });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
