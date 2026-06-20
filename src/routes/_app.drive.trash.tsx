import { createFileRoute } from "@tanstack/react-router";
import { FileExplorer } from "@/components/drive/FileExplorer";
import { useDriveCtx } from "@/components/drive/DriveContext";

export const Route = createFileRoute("/_app/drive/trash")({
  component: TrashPage,
});

function TrashPage() {
  const { uploadRef, uploadFolderRef, onUpload, search, setSearch } = useDriveCtx();
  return (
    <FileExplorer scope={{ kind: "trash" }} title="Reciclagem"
      search={search} setSearch={setSearch}
      uploadRef={uploadRef} uploadFolderRef={uploadFolderRef}
      onUpload={(f) => onUpload(f, null)} />
  );
}
