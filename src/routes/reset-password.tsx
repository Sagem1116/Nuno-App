import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // When the user clicks the email link, Supabase sets a recovery session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null);
    if (password.length < 6) { setError("A password deve ter pelo menos 6 caracteres."); return; }
    if (password !== confirm) { setError("As passwords não coincidem."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setInfo("Password atualizada. A redirecionar...");
      setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md glass-card p-8 page-enter">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Redefinir password</h1>
            <p className="text-xs text-muted-foreground">Escolhe uma nova password</p>
          </div>
        </div>

        {!ready ? (
          <p className="text-sm text-muted-foreground">
            A validar a ligação de recuperação... Se chegaste aqui sem clicar no email, volta a pedir a recuperação.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Nova password</label>
              <input
                type="password" required minLength={6}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary focus:outline-none focus:shadow-glow transition-all"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Confirmar password</label>
              <input
                type="password" required minLength={6}
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary focus:outline-none focus:shadow-glow transition-all"
              />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            {info && <div className="text-sm text-primary">{info}</div>}
            <button
              type="submit" disabled={busy}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium hover:shadow-glow-strong transition-all disabled:opacity-50"
            >
              {busy ? "..." : "Atualizar password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
