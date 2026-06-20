import { createFileRoute } from "@tanstack/react-router";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
};

export const Route = createFileRoute("/api/mundial")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const [scoreboardResponse, standingsResponse] = await Promise.all([
            fetch(
              "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=128&region=pt&lang=pt",
              {
                headers: { Accept: "application/json" },
              },
            ),
            fetch(
              "https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?region=pt&lang=pt",
              {
                headers: { Accept: "application/json" },
              },
            ),
          ]);

          if (!scoreboardResponse.ok || !standingsResponse.ok) {
            throw new Error("A fonte de dados não respondeu corretamente.");
          }

          const [scoreboard, standings] = await Promise.all([
            scoreboardResponse.json(),
            standingsResponse.json(),
          ]);

          return Response.json(
            {
              events: scoreboard.events ?? [],
              groups: standings.children ?? [],
              updatedAt: new Date().toISOString(),
            },
            { headers },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível obter os dados.";
          return Response.json(
            { error: message },
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
