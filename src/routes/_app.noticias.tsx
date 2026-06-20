import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Globe2,
  Laptop,
  Newspaper,
  RefreshCw,
  Settings2,
  Trophy,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/noticias")({
  component: NoticiasPage,
});

type TopicId = "desporto" | "tecnologia" | "portugal" | "mundo";

type Article = {
  url: string;
  title: string;
  description?: string;
  urlToImage?: string;
  publishedAt?: string;
  source?: { name?: string };
  topic: TopicId;
};

const topics = [
  { id: "desporto", label: "Desporto", icon: Trophy, query: "desporto OR futebol" },
  {
    id: "tecnologia",
    label: "Tecnologia",
    icon: Laptop,
    query: "tecnologia OR inteligência artificial",
  },
  { id: "portugal", label: "Portugal", icon: Newspaper, query: "Portugal atualidade" },
  { id: "mundo", label: "Mundo", icon: Globe2, query: "notícias mundo internacional" },
] as const;

const storageKey = "nuno-news-interests";
const defaultTopics: TopicId[] = topics.map((topic) => topic.id);

function NoticiasPage() {
  const [selectedTopics, setSelectedTopics] = useState<TopicId[]>(defaultTopics);
  const [activeTopic, setActiveTopic] = useState<TopicId | "todos">("todos");
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as TopicId[];
      const valid = parsed.filter((id) => topics.some((topic) => topic.id === id));
      if (valid.length) setSelectedTopics(valid);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  const loadNews = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const chosen = topics.filter((topic) => selectedTopics.includes(topic.id));
        const responses = await Promise.all(
          chosen.map(async (topic) => {
            const response = await fetch(
              `/api/news?q=${encodeURIComponent(topic.query)}&pageSize=8&days=7&_=${Date.now()}`,
              { cache: "no-store" },
            );
            if (!response.ok) return [];
            const data = await response.json();
            return (data.articles ?? []).map((article: Omit<Article, "topic">) => ({
              ...article,
              topic: topic.id,
            }));
          }),
        );

        const unique = new Map<string, Article>();
        responses.flat().forEach((article) => {
          if (article.url && !unique.has(article.url)) unique.set(article.url, article);
        });
        const nextArticles = [...unique.values()].sort(
          (a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""),
        );
        setArticles(nextArticles);
        if (!nextArticles.length) {
          setError("Não foi possível encontrar notícias recentes para estes temas.");
        }
      } catch {
        setError("Não foi possível atualizar as notícias. Tenta novamente dentro de instantes.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedTopics],
  );

  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  const visibleArticles = useMemo(
    () =>
      activeTopic === "todos"
        ? articles
        : articles.filter((article) => article.topic === activeTopic),
    [activeTopic, articles],
  );

  const toggleTopic = (id: TopicId) => {
    setSelectedTopics((current) => {
      const next = current.includes(id)
        ? current.length === 1
          ? current
          : current.filter((topic) => topic !== id)
        : [...current, id];
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      if (activeTopic !== "todos" && !next.includes(activeTopic)) setActiveTopic("todos");
      return next;
    });
  };

  return (
    <div className="page-enter space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card p-6 md:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              O teu resumo diário
            </p>
            <h2 className="flex items-center gap-3 text-3xl font-semibold md:text-4xl">
              <Newspaper className="h-8 w-8 text-primary" /> Notícias para ti
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Atualidade selecionada pelos teus interesses, reunida num único feed.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSettings((value) => !value)}>
              <Settings2 /> Interesses
            </Button>
            <Button variant="outline" onClick={() => void loadNews(true)} disabled={refreshing}>
              <RefreshCw className={refreshing ? "animate-spin" : ""} /> Atualizar
            </Button>
          </div>
        </div>
      </section>

      {showSettings && (
        <section className="glass-card p-5">
          <h3 className="font-semibold">Escolhe os teus interesses</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Seleciona pelo menos um tema. As preferências ficam guardadas neste dispositivo.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {topics.map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant={selectedTopics.includes(id) ? "default" : "outline"}
                onClick={() => toggleTopic(id)}
                aria-pressed={selectedTopics.includes(id)}
              >
                <Icon /> {label}
              </Button>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card/60 p-1">
        <Button
          size="sm"
          variant={activeTopic === "todos" ? "default" : "ghost"}
          onClick={() => setActiveTopic("todos")}
        >
          Todas
        </Button>
        {topics
          .filter((topic) => selectedTopics.includes(topic.id))
          .map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              size="sm"
              variant={activeTopic === id ? "default" : "ghost"}
              onClick={() => setActiveTopic(id)}
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
          A PREPARAR O TEU FEED
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleArticles.map((article) => {
            const topic = topics.find((item) => item.id === article.topic);
            return (
              <a
                key={`${article.topic}-${article.url}`}
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="group glass-card overflow-hidden transition hover:border-primary/60 hover:shadow-glow"
              >
                {article.urlToImage ? (
                  <img
                    src={article.urlToImage}
                    alt=""
                    loading="lazy"
                    className="h-44 w-full object-cover"
                  />
                ) : (
                  <div className="grid h-32 place-items-center bg-muted/40">
                    <Newspaper className="h-9 w-9 text-muted-foreground" />
                  </div>
                )}
                <div className="p-5">
                  <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-primary/15 px-2 py-1 font-semibold text-primary">
                      {topic?.label}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 transition group-hover:text-primary" />
                  </div>
                  <h3 className="font-semibold leading-snug transition group-hover:text-primary">
                    {article.title}
                  </h3>
                  <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                    {article.description ?? "Ler notícia completa."}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="truncate">{article.source?.name ?? "Notícias"}</span>
                    {article.publishedAt && (
                      <span className="shrink-0">
                        {formatDistanceToNow(new Date(article.publishedAt), {
                          addSuffix: true,
                          locale: pt,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </section>
      )}
    </div>
  );
}
