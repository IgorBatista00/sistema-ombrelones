import { z } from "zod";
export const addressSchema = z.object({
  label: z.string().max(60).optional(),
  recipient: z.string().trim().min(2).max(120),
  zipCode: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length === 8, "CEP inválido"),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional(),
  district: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2).transform((v) => v.toUpperCase()),
  phone: z.string().optional(),
});
