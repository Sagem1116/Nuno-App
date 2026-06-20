import { createFileRoute } from "@tanstack/react-router";

const decodeXml = (value: string) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));

const tagValue = (item: string, tag: string) => {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
};

async function fetchGoogleNews(query: string, pageSize: string) {
  const feedUrl = /tecnologia|inteligência artificial/i.test(query)
    ? "https://tek.sapo.pt/rss"
    : /desporto|futebol|mundial|copa do mundo/i.test(query)
      ? "https://www.publico.pt/rss/desporto"
      : "https://www.rtp.pt/noticias/rss/";
  let response = await fetch(feedUrl, {
    headers: { "User-Agent": process.env.USER_AGENT ?? "nunoapp/1.0" },
  });
  if (!response.ok) throw new Error("Fonte alternativa indisponível");

  let xml = await response.text();
  if (!/<item>/i.test(xml)) {
    const bingParams = new URLSearchParams({ q: query, format: "rss", setlang: "pt-pt" });
    response = await fetch(`https://www.bing.com/news/search?${bingParams.toString()}`, {
      headers: { "User-Agent": process.env.USER_AGENT ?? "nunoapp/1.0" },
    });
    if (!response.ok) throw new Error("Fonte alternativa indisponível");
    xml = await response.text();
  }
  const limit = Math.min(Math.max(Number(pageSize) || 5, 1), 30);
  const articles = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .slice(0, limit)
    .map((match) => {
      const item = match[1];
      const description = tagValue(item, "description")
        .replace(/<[^>]+>/g, " ")
        .trim();
      return {
        title: tagValue(item, "title"),
        description,
        url: tagValue(item, "link"),
        urlToImage: null,
        publishedAt: new Date(tagValue(item, "pubDate")).toISOString(),
        source: {
          name: tagValue(item, "source") || tagValue(item, "News:Source") || "Notícias",
        },
      };
    })
    .filter((article) => article.title && article.url);

  return { status: "ok", totalResults: articles.length, articles };
}

export const Route = createFileRoute("/api/news")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const NEWS_API_KEY = process.env.NEWS_API_KEY;
        const url = new URL(request.url);
        const query = url.searchParams.get("q")?.trim();
        const pageSize = url.searchParams.get("pageSize") ?? "5";

        if (!query) {
          return new Response("Query de pesquisa em falta", { status: 400 });
        }

        if (!NEWS_API_KEY) {
          return Response.json(await fetchGoogleNews(query, pageSize));
        }

        // Default: only return news from the last 7 days, sorted by most recent
        const daysParam = Number(url.searchParams.get("days") ?? "7");
        const fromDate = new Date(Date.now() - daysParam * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const params = new URLSearchParams({
          apiKey: NEWS_API_KEY,
          q: query,
          language: "pt",
          sortBy: "publishedAt",
          pageSize,
          from: fromDate,
        });

        const headers: Record<string, string> = {
          Accept: "application/json",
          // Provide a User-Agent to identify the application (required by some APIs)
          "User-Agent": process.env.USER_AGENT ?? "nunoapp/1.0",
        };

        const response = await fetch(`https://newsapi.org/v2/everything?${params.toString()}`, {
          headers,
          cache: "no-store",
        });
        if (!response.ok) {
          return Response.json(await fetchGoogleNews(query, pageSize));
        }
        const data = await response.json();

        // Sort defensively by publishedAt desc in case upstream order drifts
        if (Array.isArray(data?.articles)) {
          data.articles.sort((a: { publishedAt?: string }, b: { publishedAt?: string }) => {
            const ta = a?.publishedAt ? Date.parse(a.publishedAt) : 0;
            const tb = b?.publishedAt ? Date.parse(b.publishedAt) : 0;
            return tb - ta;
          });
        }

        return new Response(JSON.stringify(data), {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, max-age=0",
          },
        });
      },
    },
  },
});
