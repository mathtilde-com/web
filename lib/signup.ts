import { z } from "zod";

export const GENDERS = ["male", "female", "non-binary", "other", "prefer_not_to_say"] as const;
export type Gender = (typeof GENDERS)[number];

const empty = (v: unknown) => (v === "" || v === undefined ? null : v);

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password must be at most 72 characters"),
  birthDate: z.preprocess(empty, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  gender: z.preprocess(empty, z.enum(GENDERS).nullable()),
}).superRefine((v, ctx) => {
  if (!v.birthDate) return;
  const t = Date.parse(v.birthDate + "T00:00:00Z");
  const year = Number(v.birthDate.slice(0, 4));
  if (Number.isNaN(t) || t > Date.now() || year < 1900)
    ctx.addIssue({ code: "custom", path: ["birthDate"], message: "Invalid birth date" });
});

export function parseSignup(input: unknown):
  | { ok: true; data: { email: string; password: string; birthDate: string | null; gender: Gender | null } }
  | { ok: false; error: string } {
  const r = schema.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Invalid input" };
  return { ok: true, data: r.data as never };
}
