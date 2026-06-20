import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plug, ExternalLink, Loader2, Check, X, Star, Code2 } from "lucide-react";

const Github = Code2;
import { getGithubStatus, saveGithubToken, disconnectGithub } from "@/lib/github.functions";
import { inputCls } from "./_app.notas";

export const Route = createFileRoute("/_app/apps")({
  component: AppsPage,
});

function AppsPage() {
  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-2xl font-bold neon-text flex items-center gap-2">
          <Plug className="h-6 w-6" /> Apps & Integrações
        </h1>
        <p className="text-sm text-muted-foreground">
          Liga serviços externos à tua conta. As credenciais são guardadas só para ti.
        </p>
      </div>

      <GithubCard />
    </div>
  );
}

function GithubCard() {
  const fetchStatus = useServerFn(getGithubStatus);
  const saveToken = useServerFn(saveGithubToken);
  const disconnect = useServerFn(disconnectGithub);

  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const s = await fetchStatus();
      setStatus(s);
    } catch (e: any) {
      setError(e?.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveToken({ data: { token } });
      setToken("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Token inválido");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Desligar GitHub?")) return;
    setBusy(true);
    try {
      await disconnect();
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card neon-border p-6">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary-glow/10 border border-primary/30 grid place-items-center">
            <Github className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">GitHub</h2>
            <p className="text-xs text-muted-foreground">Ver os teus repositórios via Personal Access Token.</p>
          </div>
        </div>
        {status?.connected && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
            <Check className="h-3 w-3" /> Ligado
          </span>
        )}
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar...
        </div>
      ) : status?.connected ? (
        <div className="space-y-4">
          {status.user && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/30 border border-border">
              <img src={status.user.avatar_url} alt="" className="h-12 w-12 rounded-full" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{status.user.name || status.user.login}</div>
                <a href={status.user.html_url} target="_blank" rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                  @{status.user.login} · {status.user.public_repos} repos
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <button onClick={handleDisconnect} disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10">
                <X className="h-3.5 w-3.5 inline mr-1" /> Desligar
              </button>
            </div>
          )}
          {status.error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {status.error}
            </div>
          )}
          {status.repos && status.repos.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Repositórios recentes</h3>
              <ul className="space-y-1.5">
                {status.repos.map((r: any) => (
                  <li key={r.id}>
                    <a href={r.html_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent/40 border border-border">
                      <Github className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{r.full_name}</div>
                        {r.description && (
                          <div className="text-xs text-muted-foreground truncate">{r.description}</div>
                        )}
                      </div>
                      {r.language && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-border">{r.language}</span>
                      )}
                      {r.stargazers_count > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Star className="h-3 w-3" /> {r.stargazers_count}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cria um Personal Access Token em{" "}
            <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1">
              github.com/settings/tokens <ExternalLink className="h-3 w-3" />
            </a>{" "}
            com permissão de leitura nos repositórios.
          </p>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_... ou github_pat_..."
            className={inputCls}
          />
          {error && <div className="text-xs text-destructive">{error}</div>}
          <button
            onClick={handleSave}
            disabled={busy || token.length < 20}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:shadow-glow-strong disabled:opacity-50"
          >
            {busy ? "A validar..." : "Ligar"}
          </button>
        </div>
      )}
    </div>
  );
}
