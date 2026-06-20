import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function githubFetch(token: string, path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "nuno-app",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }
  return res.json();
}

export const getGithubStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("user_integrations" as any)
      .select("token,metadata,updated_at")
      .eq("provider", "github")
      .maybeSingle();
    if (!data) return { connected: false as const };
    try {
      const user = await githubFetch((data as any).token, "/user");
      const repos = await githubFetch(
        (data as any).token,
        "/user/repos?per_page=8&sort=updated"
      );
      return {
        connected: true as const,
        user: {
          login: user.login,
          name: user.name,
          avatar_url: user.avatar_url,
          html_url: user.html_url,
          public_repos: user.public_repos,
        },
        repos: (repos as any[]).map((r) => ({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          html_url: r.html_url,
          description: r.description,
          private: r.private,
          stargazers_count: r.stargazers_count,
          language: r.language,
          updated_at: r.updated_at,
        })),
      };
    } catch (e: any) {
      return { connected: true as const, error: e?.message ?? "Erro" };
    }
  });

export const saveGithubToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => {
    if (!d?.token || typeof d.token !== "string" || d.token.length < 20) {
      throw new Error("Token inválido");
    }
    return { token: d.token.trim() };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Validate the token first
    const user = await githubFetch(data.token, "/user");
    const { error } = await supabase
      .from("user_integrations" as any)
      .upsert(
        {
          user_id: userId,
          provider: "github",
          token: data.token,
          metadata: { login: user.login, avatar_url: user.avatar_url },
        },
        { onConflict: "user_id,provider" }
      );
    if (error) throw new Error(error.message);
    return { ok: true, login: user.login };
  });

export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    await supabase
      .from("user_integrations" as any)
      .delete()
      .eq("provider", "github");
    return { ok: true };
  });
