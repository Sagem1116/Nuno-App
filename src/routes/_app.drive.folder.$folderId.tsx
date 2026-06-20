import { createFileRoute } from "@tanstack/react-router";
import { FileExplorer } from "@/components/drive/FileExplorer";
import { useDriveCtx } from "@/components/drive/DriveContext";

export const Route = createFileRoute("/_app/drive/folder/$folderId")({
  component: FolderPage,
});

function FolderPage() {
  const { folderId } = Route.useParams();
  const { uploadRef, uploadFolderRef, onUpload, search, setSearch } = useDriveCtx();
  return (
    <FileExplorer
      scope={{ kind: "folder", folderId }}
      title="Meu Espaço"
      search={search} setSearch={setSearch}
      uploadRef={uploadRef} uploadFolderRef={uploadFolderRef}
      onUpload={(f) => onUpload(f, folderId)}
    />
  );
}
