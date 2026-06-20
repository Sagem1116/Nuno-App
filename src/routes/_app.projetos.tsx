import { createFileRoute } from "@tanstack/react-router";
import { FolderKanban } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_app/projetos")({
  component: () => (
    <ModulePlaceholder
      icon={FolderKanban}
      title="Projetos"
      description="Acompanha objetivos e marcos dos teus projetos."
    />
  ),
});
