"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().min(2).max(100),
});

export type AuthActionResult =
  | { success: true; redirectTo?: string }
  | { success: false; error: string };

export async function loginAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { success: false, error: "Nieprawidłowy adres email lub hasło." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { success: false, error: "Błędny email lub hasło." };
  }

  return { success: true, redirectTo: "/" };
}

export async function signupAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    companyName: formData.get("companyName"),
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(", ");
    return { success: false, error: issues };
  }

  const { email, password, companyName } = parsed.data;
  const supabase = await createServerClient();

  const { data: authData, error: signupError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signupError) {
    return { success: false, error: signupError.message };
  }

  if (!authData.user) {
    return { success: false, error: "Nie udało się utworzyć konta." };
  }

  // Create organization for the new user
  const serviceClient = await createServiceClient();
  const slug = await generateUniqueSlug(serviceClient, companyName);

  const { data: org, error: orgError } = await serviceClient
    .from("organizations")
    .insert({ name: companyName, slug })
    .select("id")
    .single();

  if (orgError || !org) {
    return { success: false, error: "Błąd tworzenia organizacji." };
  }

  const { error: memberError } = await serviceClient.from("org_members").insert({
    org_id: org.id,
    user_id: authData.user.id,
    role: "owner",
  });

  if (memberError) {
    return { success: false, error: "Błąd tworzenia członkostwa w organizacji." };
  }

  return { success: true, redirectTo: `/${slug}/upload` };
}

export async function logoutAction() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function generateUniqueSlug(
  client: Awaited<ReturnType<typeof createServiceClient>>,
  name: string
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 1;

  while (true) {
    const { data } = await client
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .single();
    if (!data) return slug;
    slug = `${base}-${suffix++}`;
  }
}
