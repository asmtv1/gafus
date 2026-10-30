import { MomentAuthorAvatar } from "./MomentAuthorAvatar";

/** Comment-specific alias to the shared authorized, lazy avatar loader. */
export function MomentCommentAvatar(props: { commentId: string; username: string; name: string }) {
  return <MomentAuthorAvatar {...props} />;
}
