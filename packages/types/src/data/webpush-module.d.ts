import { PushSubscription, SendResult } from "./push";
import { RequestOptions } from "http";

declare module "web-push" {
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: RequestOptions,
  ): Promise<SendResult>;

  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;

  const webpush: {
    sendNotification: typeof sendNotification;
    setVapidDetails: typeof setVapidDetails;
  };

  export default webpush;
}
