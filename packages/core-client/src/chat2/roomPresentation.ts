/** Shared room identity rules; URL validation remains in the platform adapter. */
type RoomMember = { userId: string; username?: string | null; avatarUrl?: string | null };
type Room = { kind: string; members: readonly RoomMember[]; name?: string | null; avatarUrl?: string | null };

export function chat2RoomName(room: Room, ownerId: string, directFallback: string): string {
  return room.name || (room.kind === "CYNOLOGIST"
    ? "Чат с кинологом"
    : room.kind === "DIRECT"
      ? room.members.find(member => member.userId !== ownerId)?.username || directFallback
      : "Сообщество");
}

export function chat2RoomAvatar(room: Room | null | undefined, ownerId: string): string | null {
  if (!room) return null;
  return (room.kind === "DIRECT" || room.kind === "CYNOLOGIST"
    ? room.members.find(member => member.userId !== ownerId)?.avatarUrl
    : room.avatarUrl) ?? null;
}
