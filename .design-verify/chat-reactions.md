# Message reactions: Telegram interaction in the existing GAFUS chat
Scope: one feature region, mobile and web. Preserve existing palette, bubbles and composer.
Reference: Telegram official reaction guide: double-tap quick thumbs-up; hold/context menu emoji strip; expanded emoji choice; selected reaction can be removed.
Routes: native Channel MessageReactionPicker and ReactionListBottom injections; web existing message menu and custom ReactionsList. Both retain SDK messages/attachments/quotes/receipts.
Acceptance: six quick emoji plus expanded grid, reaction pills below message with count and own selection, double tap/click thumbs-up, repeat tap removes, switching selects one reaction per user, participant list via SDK paginated reaction query. Deleted/system messages excluded. Server checks access and message channel; actor derived from authentication; direct Stream mutation grants unchanged.
Verification: core authorization tests, mobile/web/core typechecks; UI render check where available. Production mutation verification requires publishing server route.
