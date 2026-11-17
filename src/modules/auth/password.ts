import bcrypt from "bcryptjs";
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres")
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use letras e números");

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);
