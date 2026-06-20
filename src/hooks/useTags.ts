import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/drive";
import { toast } from "sonner";

export type TagRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
};

export type ItemTagRow = {
  id: string;
  tag_id: string;
  file_id?: string | null;
  folder_id?: string | null;
};

const TAGS_KEY = ["tags"];
const FILE_TAGS_KEY = ["file_tags"];
const FOLDER_TAGS_KEY = ["folder_tags"];

export function useTags() {
  return useQuery({
    queryKey: TAGS_KEY,
    queryFn: async (): Promise<TagRow[]> => {
      const { data, error } = await supabase.from("tags").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as TagRow[];
    },
  });
}

export function useFileTags() {
  return useQuery({
    queryKey: FILE_TAGS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("file_tags").select("id, tag_id, file_id");
      if (error) throw error;
      return (data ?? []) as ItemTagRow[];
    },
  });
}

export function useFolderTags() {
  return useQuery({
    queryKey: FOLDER_TAGS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("folder_tags").select("id, tag_id, folder_id");
      if (error) throw error;
      return (data ?? []) as ItemTagRow[];
    },
  });
}

export function useTagMutations() {
  const qc = useQueryClient();
  const invAll = () => {
    qc.invalidateQueries({ queryKey: TAGS_KEY });
    qc.invalidateQueries({ queryKey: FILE_TAGS_KEY });
    qc.invalidateQueries({ queryKey: FOLDER_TAGS_KEY });
  };

  const createTag = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const uid = await getCurrentUserId();
      const { data, error } = await supabase
        .from("tags")
        .insert({ user_id: uid, name: name.trim(), color })
        .select()
        .single();
      if (error) throw error;
      return data as TagRow;
    },
    onSuccess: () => { invAll(); toast.success("Etiqueta criada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      const { error } = await supabase.from("tags").update({ name: name.trim(), color }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invAll(); toast.success("Etiqueta atualizada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("file_tags").delete().eq("tag_id", id);
      await supabase.from("folder_tags").delete().eq("tag_id", id);
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invAll(); toast.success("Etiqueta eliminada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setItemTag = useMutation({
    mutationFn: async ({ kind, id, tagId, on }: { kind: "file" | "folder"; id: string; tagId: string; on: boolean }) => {
      const uid = await getCurrentUserId();
      if (kind === "file") {
        if (on) {
          const { error } = await supabase.from("file_tags").insert({ user_id: uid, tag_id: tagId, file_id: id });
          if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
        } else {
          const { error } = await supabase.from("file_tags").delete().eq("file_id", id).eq("tag_id", tagId);
          if (error) throw error;
        }
      } else {
        if (on) {
          const { error } = await supabase.from("folder_tags").insert({ user_id: uid, tag_id: tagId, folder_id: id });
          if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
        } else {
          const { error } = await supabase.from("folder_tags").delete().eq("folder_id", id).eq("tag_id", tagId);
          if (error) throw error;
        }
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: vars.kind === "file" ? FILE_TAGS_KEY : FOLDER_TAGS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { createTag, updateTag, deleteTag, setItemTag };
}
