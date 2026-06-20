import { createContext, useContext } from "react";
import type { MutableRefObject } from "react";

export interface DriveCtxValue {
  uploadRef: MutableRefObject<HTMLInputElement | null>;
  uploadFolderRef: MutableRefObject<HTMLInputElement | null>;
  onUpload: (files: FileList, folderId?: string | null) => void;
  search: string;
  setSearch: (v: string) => void;
  tagFilter: string | null;
  setTagFilter: (id: string | null) => void;
}

export const DriveCtx = createContext<DriveCtxValue | null>(null);

export const useDriveCtx = () => {
  const c = useContext(DriveCtx);
  if (!c) throw new Error("DriveCtx missing");
  return c;
};
