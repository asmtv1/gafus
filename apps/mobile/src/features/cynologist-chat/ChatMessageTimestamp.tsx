import { MessageTimestamp, type MessageTimestampProps } from "stream-chat-expo";

/** Date getters use the device's local timezone, regardless of its 12/24-hour preference. */
export function ChatMessageTimestamp(props: MessageTimestampProps) {
  const date = props.timestamp ? new Date(props.timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return <MessageTimestamp {...props} formattedDate={time} />;
}
