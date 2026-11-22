export type CardCheckoutProps = {
  ownerKey: string;
  sameOwner: () => boolean;
  busy: boolean;
  withLock: (action: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  report: (message: string) => void;
};
/** Store and recovery bundles have no external checkout entry point. */
export function OptionalCardCheckout(_props: CardCheckoutProps) {
  return null;
}
