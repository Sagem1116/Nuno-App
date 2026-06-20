import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        setInfo("Conta criada. Verifica o teu email para confirmar.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo("Email de recuperação enviado. Verifica a tua caixa de entrada.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md glass-card p-8 page-enter">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Nuno<span className="neon-text"> App</span></h1>
            <p className="text-xs text-muted-foreground">A tua plataforma pessoal</p>
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-lg bg-muted/40 mb-6">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); setInfo(null); }}
              className={[
                "flex-1 py-2 text-sm rounded-md transition-all",
                mode === m
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {m === "login" ? "Entrar" : "Registar"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary focus:outline-none focus:shadow-glow transition-all"
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary focus:outline-none focus:shadow-glow transition-all"
              />
            </div>
          )}

          {error && <div className="text-sm text-destructive">{error}</div>}
          {info && <div className="text-sm text-primary">{info}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium hover:shadow-glow-strong transition-all disabled:opacity-50"
          >
            {busy ? "..." : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar email"}
          </button>

          <div className="text-center">
            {mode === "forgot" ? (
              <button type="button" onClick={() => { setMode("login"); setError(null); setInfo(null); }}
                className="text-xs text-muted-foreground hover:text-primary">
                ← Voltar a entrar
              </button>
            ) : (
              <button type="button" onClick={() => { setMode("forgot"); setError(null); setInfo(null); }}
                className="text-xs text-muted-foreground hover:text-primary">
                Esqueceste-te da password?
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
