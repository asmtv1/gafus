import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { feedApi, feedDeletePostGuarded } from "@/shared/lib/api/feed";
import { reportClientError } from "@/shared/lib/tracer";
import { COLORS, FONTS } from "@/shared/config";

/** Delete a failed local publication or a draft/failed post recovered from the server. */
export function FeedDraftDeleteButton({ ownerId, postId, onDeleted }: {
  ownerId: string;
  postId?: string;
  onDeleted: () => void;
}) {
  const currentOwner = useAuthStore(state =>
    state.isAuthenticated && !state.isLoading ? state.user?.id : undefined);
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = binding?.principalId === ownerId && currentOwner === ownerId
    ? binding.authEpoch : undefined;
  return <ActorDraftDeleteButton key={`${ownerId}:${epoch ?? "unverified"}:${postId ?? "local"}`}
    ownerId={ownerId} epoch={epoch} postId={postId} onDeleted={onDeleted} />;
}

function ActorDraftDeleteButton({ ownerId, epoch, postId, onDeleted }: {
  ownerId: string;
  epoch?: string;
  postId?: string;
  onDeleted: () => void;
}) {
  const cache = useQueryClient();
  const mounted = useRef(true);
  const pending = useRef(false);
  const unknown = useRef(false);
  const confirmed = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const isCurrentOwner = () => {
    const state = useAuthStore.getState();
    const current = newOnlyV2NativeQueues.getVerifiedBinding();
    return mounted.current && !!epoch && state.isAuthenticated && !state.isLoading &&
      state.user?.id === ownerId && current?.principalId === ownerId && current.authEpoch === epoch;
  };
  const deleteConfirmed = async () => {
    if (!isCurrentOwner() || pending.current || unknown.current || confirmed.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (postId) {
        // A stale queue snapshot must never delete a post already published elsewhere.
        const editor = await feedApi.getEditor(postId);
        if (!isCurrentOwner()) return;
        if (editor.id !== postId || editor.author.id !== ownerId ||
            (editor.status !== "draft" && editor.status !== "failed")) {
          throw new Error("FEED_DRAFT_DELETE_STATE_UNCONFIRMED");
        }
        const result = await feedDeletePostGuarded(postId, isCurrentOwner);
        if (!isCurrentOwner()) return;
        if (!result || result.id !== postId) throw new Error("FEED_DRAFT_DELETE_ACK_MISMATCH");
      }
      if (!isCurrentOwner()) return;
      confirmed.current = true;
      onDeleted();
      void cache.invalidateQueries({ queryKey: ["feed"] }).catch(() => {
        reportClientError(new Error("FEED_DRAFT_DELETE_REFRESH_FAILED"), {
          issueKey: "FeedDraftDeleteButton", keys: { operation: "refresh" },
        });
      });
    } catch {
      if (!isCurrentOwner()) return;
      unknown.current = true;
      reportClientError(new Error("FEED_DRAFT_DELETE_UNCONFIRMED"), {
        issueKey: "FeedDraftDeleteButton", keys: { operation: "delete_draft" },
      });
      Alert.alert("Моменты", "Не удалось подтвердить удаление черновика. Обновите список перед повторной попыткой.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return <Pressable accessibilityRole="button" accessibilityLabel="Удалить черновик"
    disabled={!epoch || busy || unknown.current || confirmed.current}
    onPress={() => {
      if (!isCurrentOwner() || pending.current || unknown.current || confirmed.current) return;
      Alert.alert("Удалить черновик?", "Черновик и загруженные вложения будут удалены без возможности восстановления.", [
        { text: "Отмена", style: "cancel" },
        { text: "Удалить", style: "destructive", onPress: () => void deleteConfirmed() },
      ]);
    }}
    style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 8 }}>
    <Text style={{ fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.error ?? COLORS.text }}>
      {busy ? "Удаляем…" : "Удалить черновик"}
    </Text>
  </Pressable>;
}
