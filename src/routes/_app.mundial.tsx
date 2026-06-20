import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Newspaper, RefreshCw, Trophy, Tv } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/mundial")({
  component: MundialPage,
});

type Team = { displayName: string; abbreviation: string; logo?: string };
type Competitor = { homeAway: "home" | "away"; score?: string; winner?: boolean; team: Team };
type Event = {
  id: string;
  date: string;
  status: { type: { state: "pre" | "in" | "post"; detail: string; shortDetail: string } };
  competitions: Array<{
    competitors: Competitor[];
    venue?: { fullName?: string };
    notes?: Array<{ headline?: string }>;
  }>;
};
type StandingStat = { name: string; value?: number; displayValue?: string };
type Group = {
  id: string;
  name: string;
  standings?: { entries?: Array<{ team: Team; stats: StandingStat[] }> };
};
type Article = {
  url: string;
  title: string;
  description?: string;
  urlToImage?: string;
  publishedAt?: string;
  source?: { name?: string };
};

const isPortugalNews = (article: Article) =>
  /\b(portugal|portugu(?:ês|esa|eses|esas)|seleção nacional|equipa das quinas)\b/i.test(
    `${article.title} ${article.description ?? ""}`,
  );

const stat = (stats: StandingStat[], name: string) =>
  stats.find((item) => item.name === name)?.displayValue ?? "0";

function MundialPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [news, setNews] = useState<Article[]>([]);
  const [tab, setTab] = useState<
    "resultados" | "classificacoes" | "programacao" | "noticias"
  >("resultados");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [worldCupResponse, portugalNewsResponse, worldNewsResponse] = await Promise.all([
        fetch(`/api/mundial?_=${Date.now()}`, { cache: "no-store" }),
        fetch(
          `/api/news?q=${encodeURIComponent('(Mundial 2026 OR "Copa do Mundo 2026") AND (Portugal OR "seleção portuguesa" OR "equipa das quinas")')}&pageSize=10&days=14&_=${Date.now()}`,
          { cache: "no-store" },
        ),
        fetch(
          `/api/news?q=${encodeURIComponent('"Mundial 2026" OR "Copa do Mundo 2026"')}&pageSize=20&days=7&_=${Date.now()}`,
          { cache: "no-store" },
        ),
      ]);
      if (!worldCupResponse.ok)
        throw new Error("Não foi possível atualizar resultados e classificações.");
      const worldCup = await worldCupResponse.json();
      setEvents(worldCup.events ?? []);
      setGroups(worldCup.groups ?? []);
      setUpdatedAt(new Date(worldCup.updatedAt ?? Date.now()));
      const [portugalNewsData, worldNewsData] = await Promise.all([
        portugalNewsResponse.ok ? portugalNewsResponse.json() : Promise.resolve({ articles: [] }),
        worldNewsResponse.ok ? worldNewsResponse.json() : Promise.resolve({ articles: [] }),
      ]);
      const uniqueNews = new Map<string, Article>();
      [...(portugalNewsData.articles ?? []), ...(worldNewsData.articles ?? [])].forEach(
        (article: Article) => uniqueNews.set(article.url, article),
      );
      setNews(
        [...uniqueNews.values()]
          .sort((a, b) => {
            const portugalPriority = Number(isPortugalNews(b)) - Number(isPortugalNews(a));
            if (portugalPriority) return portugalPriority;
            return Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "");
          })
          .slice(0, 18),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ocorreu um erro ao atualizar os dados.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const orderedEvents = useMemo(() => {
    const now = Date.now();
    return [...events].sort((a, b) => {
      const priority = (event: Event) =>
        event.status.type.state === "in" ? 0 : new Date(event.date).getTime() >= now ? 1 : 2;
      const difference = priority(a) - priority(b);
      if (difference) return difference;
      return priority(a) === 2
        ? new Date(b.date).getTime() - new Date(a.date).getTime()
        : new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [events]);

  return (
    <div className="page-enter space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card p-6 md:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Em atualização
            </div>
            <h2 className="flex items-center gap-3 text-3xl font-semibold md:text-4xl">
              <Trophy className="h-8 w-8 text-primary" /> Mundial 2026
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Resultados, calendário, classificações dos grupos e as últimas notícias num só lugar.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {updatedAt && (
              <span className="text-xs text-muted-foreground">
                Atualizado às {format(updatedAt, "HH:mm")}
              </span>
            )}
            <Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw className={refreshing ? "animate-spin" : ""} /> Atualizar
            </Button>
          </div>
        </div>
      </section>

      <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-card/60 p-1">
        {(
          [
            ["resultados", "Resultados", CalendarDays],
            ["classificacoes", "Classificações", Trophy],
            ["programacao", "Programação", Tv],
            ["noticias", "Notícias", Newspaper],
          ] as const
        ).map(([value, label, Icon]) => (
          <Button
            key={value}
            variant={tab === value ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab(value)}
          >
            <Icon /> {label}
          </Button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {loading ? (
        <div className="grid min-h-64 place-items-center text-sm tracking-widest text-muted-foreground animate-pulse">
          A CARREGAR MUNDIAL
        </div>
      ) : null}

      {!loading && tab === "resultados" && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orderedEvents.map((event) => {
            const competition = event.competitions[0];
            const home = competition?.competitors.find((team) => team.homeAway === "home");
            const away = competition?.competitors.find((team) => team.homeAway === "away");
            if (!home || !away) return null;
            const live = event.status.type.state === "in";
            const finished = event.status.type.state === "post";
            return (
              <article
                key={event.id}
                className="glass-card p-5 transition-colors hover:border-primary/50"
              >
                <div className="mb-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{format(new Date(event.date), "EEE, d MMM · HH:mm", { locale: pt })}</span>
                  <span
                    className={
                      live
                        ? "rounded-full bg-destructive/15 px-2 py-1 font-semibold text-destructive"
                        : "text-right"
                    }
                  >
                    {live
                      ? `AO VIVO · ${event.status.type.shortDetail}`
                      : finished
                        ? "Terminado"
                        : event.status.type.shortDetail}
                  </span>
                </div>
                {[home, away].map((competitor) => (
                  <div key={competitor.team.abbreviation} className="flex items-center gap-3 py-2">
                    {competitor.team.logo ? (
                      <img
                        src={competitor.team.logo}
                        alt={`Bandeira de ${competitor.team.displayName}`}
                        className="h-7 w-7 object-contain"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-muted" />
                    )}
                    <span
                      className={`flex-1 text-sm ${competitor.winner ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                    >
                      {competitor.team.displayName}
                    </span>
                    <span className="text-xl font-semibold tabular-nums">
                      {finished || live ? (competitor.score ?? "0") : "–"}
                    </span>
                  </div>
                ))}
                <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  {competition.venue?.fullName ??
                    competition.notes?.[0]?.headline ??
                    "Mundial 2026"}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {!loading && tab === "classificacoes" && (
        <section className="grid gap-4 xl:grid-cols-2">
          {groups.map((group) => (
            <article key={group.id} className="glass-card overflow-hidden">
              <h3 className="border-b border-border px-5 py-4 font-semibold">{group.name}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-96 text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Seleção</th>
                      <th>J</th>
                      <th>V</th>
                      <th>E</th>
                      <th>D</th>
                      <th>DG</th>
                      <th className="pr-4">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(group.standings?.entries ?? []).map((entry, index) => (
                      <tr key={entry.team.abbreviation} className="border-t border-border/60">
                        <td className="flex items-center gap-2 px-4 py-3 font-medium">
                          <span className="w-4 text-xs text-muted-foreground">{index + 1}</span>
                          {entry.team.logo && (
                            <img src={entry.team.logo} alt="" className="h-5 w-5 object-contain" />
                          )}
                          {entry.team.displayName}
                        </td>
                        <td className="text-center">{stat(entry.stats, "gamesPlayed")}</td>
                        <td className="text-center">{stat(entry.stats, "wins")}</td>
                        <td className="text-center">{stat(entry.stats, "ties")}</td>
                        <td className="text-center">{stat(entry.stats, "losses")}</td>
                        <td className="text-center">{stat(entry.stats, "pointDifferential")}</td>
                        <td className="pr-4 text-center font-semibold text-primary">
                          {stat(entry.stats, "points")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      )}

      {!loading && tab === "programacao" && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                <Tv className="h-5 w-5 text-primary" /> Jogos na televisão
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Horários de Portugal continental e canais de transmissão, segundo o PÚBLICO.
              </p>
            </div>
            <Button variant="outline" asChild>
              <a
                href="https://www.publico.pt/2026/06/08/desporto/noticia/saiba-horarios-canais-tv-onde-jogos-mundial-2177509"
                target="_blank"
                rel="noreferrer"
              >
                Ver artigo original <ExternalLink />
              </a>
            </Button>
          </div>

          <div className="glass-card overflow-hidden bg-background">
            <iframe
              src="https://flo.uri.sh/visualisation/29276566/embed?auto=1"
              title="Programação televisiva do Mundial 2026"
              loading="lazy"
              allowFullScreen
              className="h-[760px] w-full border-0 md:h-[680px]"
            />
          </div>
        </section>
      )}

      {!loading && tab === "noticias" && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {news.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Não foram encontradas notícias recentes.
            </p>
          ) : (
            news.map((article) => (
              <a
                key={article.url}
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="group glass-card overflow-hidden transition hover:border-primary/60 hover:shadow-glow"
              >
                {article.urlToImage ? (
                  <img
                    src={article.urlToImage}
                    alt={article.title}
                    loading="lazy"
                    className="h-44 w-full object-cover"
                  />
                ) : (
                  <div className="grid h-44 place-items-center bg-muted/40">
                    <Newspaper className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
                <div className="p-5">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2">
                      {isPortugalNews(article) && (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">
                          Destaque Portugal
                        </span>
                      )}
                      {article.source?.name ?? "Notícias"}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 transition group-hover:text-primary" />
                  </div>
                  <h3 className="font-semibold leading-snug transition group-hover:text-primary">
                    {article.title}
                  </h3>
                  <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                    {article.description ?? "Ler notícia completa."}
                  </p>
                  {article.publishedAt && (
                    <p className="mt-4 text-xs text-muted-foreground">
                      {format(new Date(article.publishedAt), "d MMM, HH:mm", { locale: pt })}
                    </p>
                  )}
                </div>
              </a>
            ))
          )}
        </section>
      )}
    </div>
  );
}
