import { InternalCardCheckout } from "./InternalCardCheckout";
import type { CardCheckoutProps } from "./OptionalCardCheckout";

export function AndroidQaCardCheckout(props: CardCheckoutProps) {
  return <InternalCardCheckout {...props} androidQa />;
}
