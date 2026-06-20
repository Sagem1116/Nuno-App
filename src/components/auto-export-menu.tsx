import { useEffect, useState } from "react";
import { Clock, Download } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportTable, getAutoExport, setAutoExport, getVersionHistory, type Table } from "@/lib/data-io";

export function AutoExportMenu({ table, label }: { table: Table; label?: string }) {
  const [, force] = useState(0);
  const [cfg, setCfg] = useState(() => getAutoExport(table));
  const [hist, setHist] = useState(() => getVersionHistory(table));

  useEffect(() => {
    const t = setInterval(() => {
      setCfg(getAutoExport(table));
      setHist(getVersionHistory(table));
    }, 2000);
    return () => clearInterval(t);
  }, [table]);

  const toggle = () => {
    const next = !cfg.enabled;
    setAutoExport(table, next);
    setCfg(getAutoExport(table));
    force((n) => n + 1);
  };

  const doExport = async () => {
    await exportTable(table);
    setHist(getVersionHistory(table));
  };

  const lastTxt = cfg.last ? new Date(cfg.last).toLocaleString() : "Nunca";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
          title="Auto-exportação semanal"
        >
          <Clock className="h-3.5 w-3.5" /> Auto-export
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs">
          {label ?? table} · Auto-exportação semanal
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggle(); }}>
          <span className="flex-1">{cfg.enabled ? "✓ Ativada" : "Ativar (semanal)"}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); doExport(); }}>
          <Download className="h-3.5 w-3.5 mr-2" /> Exportar versão agora
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">
          Última: {lastTxt}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">
          Versões recentes
        </DropdownMenuLabel>
        {hist.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            Sem versões ainda
          </DropdownMenuItem>
        ) : (
          hist.slice(0, 8).map((h, i) => (
            <DropdownMenuItem key={i} className="text-[11px] flex-col items-start gap-0">
              <span className="truncate w-full">{h.filename}</span>
              <span className="text-muted-foreground">
                {new Date(h.at).toLocaleString()} · {h.count} item(s)
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
