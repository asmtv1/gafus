import { NativeModules, Platform } from "react-native";
import type { DogWalk } from "./walkModel";

export interface NativeWalkSteps {
  ownerId: string;
  walkId: string;
  steps: number;
  running: boolean;
  incomplete: boolean;
  sensor: "counter" | "detector" | "none";
}
type NativeStepBridge = {
  availability(): Promise<"counter" | "detector" | "none" | "permission">;
  snapshot(): Promise<NativeWalkSteps>;
  start(ownerId: string, walkId: string, steps: number): Promise<NativeWalkSteps>;
  pause(ownerId: string, walkId: string): Promise<NativeWalkSteps>;
  finish(ownerId: string, walkId: string): Promise<NativeWalkSteps>;
  pauseAny(expectedOwnerId: string): Promise<boolean>;
};
function bridge(): NativeStepBridge | null {
  return Platform.OS === "android"
    ? ((NativeModules.GafusDogWalkSteps as NativeStepBridge | undefined) ?? null)
    : null;
}
export function hasAndroidBackgroundSteps(): boolean {
  return bridge() !== null;
}
export async function getAndroidWalkStepAvailability() {
  return (await bridge()?.availability()) ?? "none";
}
export async function getAndroidWalkStepSnapshot(): Promise<NativeWalkSteps | null> {
  return (await bridge()?.snapshot()) ?? null;
}
export async function startAndroidWalkSteps(
  owner: string,
  walk: DogWalk,
): Promise<NativeWalkSteps> {
  if (!walk.clientId || !bridge()) throw new Error("WALK_NATIVE_MODULE_MISSING");
  return bridge()!.start(owner, walk.clientId, Math.floor(walk.steps));
}
export async function pauseAndroidWalkSteps(
  owner: string,
  walk: DogWalk,
  finish = false,
): Promise<NativeWalkSteps> {
  if (!walk.clientId || !bridge()) throw new Error("WALK_NATIVE_MODULE_MISSING");
  return finish ? bridge()!.finish(owner, walk.clientId) : bridge()!.pause(owner, walk.clientId);
}
export async function pauseAnyAndroidWalkSteps(expectedOwnerId: string): Promise<void> {
  if (expectedOwnerId) await bridge()?.pauseAny(expectedOwnerId);
}

/** Never mix sessions/accounts or decrease already persisted phone steps. */
export function reconcileAndroidWalkSteps(
  walk: DogWalk,
  owner: string,
  native: NativeWalkSteps | null,
): DogWalk {
  if (!native || native.ownerId !== owner || native.walkId !== walk.clientId) return walk;
  const steps =
    Number.isSafeInteger(native.steps) && native.steps >= 0
      ? Math.max(walk.steps, native.steps)
      : walk.steps;
  const incompleteSteps = walk.incompleteSteps || native.incomplete;
  return steps === walk.steps && incompleteSteps === walk.incompleteSteps
    ? walk
    : { ...walk, steps, incompleteSteps };
}
