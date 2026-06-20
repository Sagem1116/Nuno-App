import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Blank App" },
      { name: "description", content: "A simple blank page." },
      { property: "og:title", content: "Blank App" },
      { property: "og:description", content: "A simple blank page." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background" />
  );
}

