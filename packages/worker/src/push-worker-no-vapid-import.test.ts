import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fromEnv: vi.fn(() => {throw new Error("synthetic missing VAPID");}),
  expo: vi.fn(async()=>({successCount:1,failureCount:0,deletedCount:0,temporaryFailureCount:0})),
  rustore: vi.fn(async()=>({successCount:1,failureCount:0,deletedCount:0,temporaryFailureCount:0})),
  workerOn: vi.fn(),
}));
vi.mock("@gafus/logger",()=>({
  createWorkerLogger:()=>({info:vi.fn(),warn:vi.fn(),error:vi.fn(),success:vi.fn()}),
}));
vi.mock("@gafus/queues",()=>({connection:{}}));
vi.mock("bullmq",()=>({
  Worker: class { on(...args:unknown[]){mocks.workerOn(...args);return this;} },
}));
vi.mock("@gafus/core/services/notifications",()=>({
  getPushNotificationForDelivery:vi.fn(),getUserPushSubscriptionsForDelivery:vi.fn(),
  deleteInvalidPushEndpoint:vi.fn(),recordPushNotificationDelivery:vi.fn(),
  getEligiblePushNotificationJob:vi.fn(),
}));
vi.mock("@gafus/webpush",()=>({
  PushNotificationService:{fromEnvironment:()=>mocks.fromEnv(),shouldDeleteSubscription:()=>false},
  partitionPushSubscriptions:(items:{keys:{p256dh:string}}[])=>({
    web:items.filter(item=>item.keys.p256dh==="web"),
    expo:items.filter(item=>item.keys.p256dh==="expo"),
    rustore:items.filter(item=>item.keys.p256dh==="rustore"),
  }),
  sendExpoPushNotifications:()=>mocks.expo(),
  sendRustorePushNotifications:()=>mocks.rustore(),
}));

describe("generic push-worker startup and native transport without VAPID",()=>{
  it("imports and registers job listeners without evaluating WebPush credentials",async()=>{
    const {NotificationProcessor}=await import("./push-worker");
    expect(typeof NotificationProcessor).toBe("function");
    expect(mocks.workerOn).toHaveBeenCalled();
    expect(mocks.fromEnv).not.toHaveBeenCalled();
  });
  it("sends Expo-only notification without WebPush keys or network",async()=>{
    const {NotificationProcessor}=await import("./push-worker");
    const processor=new NotificationProcessor() as unknown as {
      sendNotifications:(subscriptions:unknown[],payload:unknown)=>Promise<{
        successCount:number;failedCount:number;
      }>;
    };
    const payload={title:"Напоминание",body:"Упражнение",data:{url:"/courses"},
      icon:"/icons/icon192.png",badge:"/icons/badge-72.png"};
    const subscription=(p256dh:string)=>({
      endpoint:p256dh==="expo"?"ExpoPushToken[synthetic]":"https://example.invalid/fake",
      keys:{p256dh,auth:p256dh},
    });
    expect(await processor.sendNotifications([subscription("expo")],payload))
      .toEqual({successCount:1,failedCount:0});
    expect(mocks.fromEnv).not.toHaveBeenCalled();
    expect(mocks.expo).toHaveBeenCalledTimes(1);
    expect(await processor.sendNotifications([subscription("web"),subscription("expo")],payload))
      .toEqual({successCount:1,failedCount:1});
    expect(mocks.fromEnv).toHaveBeenCalledTimes(1);
    expect(mocks.expo).toHaveBeenCalledTimes(2);
  });
});
