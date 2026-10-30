import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { FeedPostDto } from "@gafus/types";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { feedDeletePostGuarded } from "@/shared/lib/api/feed";
import { FeedPostActions } from "./FeedPostActions";

type VerifiedOwner = { ownerId: string; epoch: string };
type OwnerProps = { post: FeedPostDto; detailed: boolean };

/** Actor-keyed native owner callbacks; the real menu still renders other public actions. */
export function FeedPostOwnerActions({ post, detailed }: OwnerProps) {
  const ownerId = useAuthStore((state) =>
    state.isAuthenticated && !state.isLoading ? (state.user?.id ?? null) : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const verified: VerifiedOwner | null =
    ownerId && binding?.principalId === ownerId && binding.authEpoch
      ? { ownerId, epoch: binding.authEpoch }
      : null;
  return (
    <ActorPostOwnerActions
      key={`${verified?.ownerId ?? "guest"}:${verified?.epoch ?? "unverified"}:${post.id}`}
      post={post}
      detailed={detailed}
      actor={verified}
    />
  );
}

function ActorPostOwnerActions({
  post,
  detailed,
  actor,
}: OwnerProps & { actor: VerifiedOwner | null }) {
  const router = useRouter();
  const cache = useQueryClient();
  const mounted = useRef(true);
  const confirmationId = useRef<number | null>(null);
  const nextConfirmationId = useRef(0);
  const deleting = useRef(false);
  const unknown = useRef(false);
  const acknowledged = useRef(false);
  const editing = useRef(false);

  const isCurrentOwner = () => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      actor !== null &&
      state.isAuthenticated &&
      !state.isLoading &&
      state.user?.id === actor.ownerId &&
      post.author.id === actor.ownerId &&
      binding?.principalId === actor.ownerId &&
      binding.authEpoch === actor.epoch
    );
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      confirmationId.current = null;
    };
  }, []);

  const edit = () => {
    if (
      !post.canEdit ||
      !isCurrentOwner() ||
      editing.current ||
      confirmationId.current !== null ||
      deleting.current ||
      unknown.current ||
      acknowledged.current
    )
      return;
    editing.current = true;
    router.push({ pathname: "/(main)/feed/create", params: { edit: post.id } } as Href);
  };

  const deleteConfirmed = async () => {
    if (
      !post.canDelete ||
      !isCurrentOwner() ||
      deleting.current ||
      unknown.current ||
      acknowledged.current
    )
      return;
    deleting.current = true;
    try {
      const result = await feedDeletePostGuarded(post.id, isCurrentOwner);
      if (!isCurrentOwner()) return;
      if (!result || result.id !== post.id) throw new Error("FEED_DELETE_ACK_MISMATCH");
      acknowledged.current = true;
      try {
        await cache.invalidateQueries({ queryKey: ["feed"] });
      } catch {
        // The server already committed the DELETE: a cache refresh failure is not a mutation error.
        reportClientError(new Error("FEED_DELETE_CACHE_INVALIDATION_FAILED"), {
          issueKey: "FeedPostOwnerActions",
          keys: { operation: "delete_cache" },
        });
      }
      if (isCurrentOwner() && detailed) router.replace("/(main)/(tabs)/feed" as Href);
    } catch {
      if (!isCurrentOwner()) return;
      unknown.current = true;
      reportClientError(new Error("FEED_DELETE_RESULT_UNCONFIRMED"), {
        issueKey: "FeedPostOwnerActions",
        keys: { operation: "delete_post" },
      });
      Alert.alert(
        "Моменты",
        "Результат удаления публикации неизвестен. Проверьте список публикаций перед повторной попыткой.",
      );
    } finally {
      deleting.current = false;
    }
  };

  const requestDelete = () => {
    if (
      !post.canDelete ||
      !isCurrentOwner() ||
      deleting.current ||
      unknown.current ||
      acknowledged.current ||
      confirmationId.current !== null
    )
      return;
    const token = ++nextConfirmationId.current;
    confirmationId.current = token;
    Alert.alert("Удалить публикацию?", "Публикация исчезнет из раздела «Моменты».", [
      {
        text: "Отмена",
        style: "cancel",
        onPress: () => {
          if (confirmationId.current === token) confirmationId.current = null;
        },
      },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          if (confirmationId.current !== token) return;
          confirmationId.current = null;
          if (isCurrentOwner()) void deleteConfirmed();
        },
      },
    ]);
  };

  return <FeedPostActions post={post} onEdit={edit} onDelete={requestDelete} />;
}
