import { createFileRoute } from "@tanstack/react-router";
import { FileExplorer } from "@/components/drive/FileExplorer";
import { useDriveCtx } from "@/components/drive/DriveContext";

export const Route = createFileRoute("/_app/drive/recent")({
  component: RecentPage,
});

function RecentPage() {
  const { uploadRef, uploadFolderRef, onUpload, search, setSearch } = useDriveCtx();
  return (
    <FileExplorer scope={{ kind: "recent" }} title="Recentes"
      search={search} setSearch={setSearch}
      uploadRef={uploadRef} uploadFolderRef={uploadFolderRef}
      onUpload={(f) => onUpload(f, null)} />
  );
}
