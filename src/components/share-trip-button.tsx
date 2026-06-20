import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Share2, Copy, Check, X, Globe } from "lucide-react";
import { enableTripShare, disableTripShare } from "@/lib/trip-share.functions";

interface Props {
  tripId: string;
  initialSlug: string | null;
  initialPublic: boolean;
  onChange?: (s: { slug: string | null; isPublic: boolean }) => void;
}

export function ShareTripButton({ tripId, initialSlug, initialPublic, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const enable = useServerFn(enableTripShare);
  const disable = useServerFn(disableTripShare);

  const url = slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/viagem/${slug}` : "";

  const handleEnable = async () => {
    setBusy(true);
    try {
      const res = await enable({ data: { tripId } });
      setSlug(res.slug);
      setIsPublic(true);
      onChange?.({ slug: res.slug, isPublic: true });
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      await disable({ data: { tripId } });
      setIsPublic(false);
      onChange?.({ slug, isPublic: false });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
      >
        <Share2 className="h-3.5 w-3.5" /> Partilhar
        {isPublic && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
          <div className="glass-card neon-border w-full max-w-md p-6 space-y-4 page-enter">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold neon-text flex items-center gap-2">
                <Globe className="h-5 w-5" /> Partilhar viagem
              </h3>
              <button onClick={() => setOpen(false)} className="p-1 hover:text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Cria um link público para qualquer pessoa ver esta viagem (sem precisar de conta).
              Os documentos privados e despesas não são partilhados.
            </p>

            {isPublic && slug ? (
              <>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={url}
                    className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-xs font-mono"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    onClick={copy}
                    className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:shadow-glow text-xs flex items-center gap-1"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copiado!" : "Copiar"}
                  </button>
                </div>
                <button
                  onClick={handleDisable}
                  disabled={busy}
                  className="w-full px-4 py-2 rounded-lg text-sm border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  {busy ? "..." : "Revogar partilha"}
                </button>
              </>
            ) : (
              <button
                onClick={handleEnable}
                disabled={busy}
                className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:shadow-glow-strong disabled:opacity-50"
              >
                {busy ? "A criar link..." : "Criar link público"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
