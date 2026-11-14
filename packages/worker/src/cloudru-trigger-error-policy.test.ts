import {describe,expect,it} from "vitest";
import { UnrecoverableError } from "bullmq";
import { safeCloudruWakeFailure } from "./cloudru-trigger-error-policy.js";
describe("media launch wake retries never replay an unknown Cloud.ru execution ACK",()=>{
 it.each([
  "CLOUDRU_JOB_EXECUTION_NETWORK_TIMEOUT",
  "CLOUDRU_JOB_EXECUTION_NETWORK_ECONNRESET",
  "CLOUDRU_JOB_EXECUTION_NETWORK_EAI_AGAIN",
  "CLOUDRU_JOB_EXECUTION_FAILED_gafus-chat-video_503",
  "CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-video-2_504",
  "CLOUDRU_JOB_EXECUTION_FAILED_gafus-chat-video-2_408",
 ])("terminates immediate queue retry after ambiguous POST %s",code=>{
  const failure=safeCloudruWakeFailure(Error(code));
  expect(failure).toBeInstanceOf(UnrecoverableError);
  expect(failure.message).toBe("CLOUDRU_JOB_EXECUTION_ACK_UNKNOWN");
 });
 it.each([
  "CLOUDRU_JOB_IAM_UNAVAILABLE_503",
  "CLOUDRU_JOB_IAM_NETWORK_TIMEOUT",
  "CLOUDRU_JOB_EXECUTION_FAILED_gafus-chat-video_429",
  "CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-video-2_429",
 ])("allows known non-execution or explicit rejection to retry %s",code=>{
  const failure=safeCloudruWakeFailure(Error(code));
  expect(failure).not.toBeInstanceOf(UnrecoverableError);
  expect(failure.message).toBe(code);
 });
 it("unknown exceptions containing private provider messages are redacted before BullMQ persistence",()=>{
  const failure=safeCloudruWakeFailure(Error("Bearer secret-token /private?key=test"));
  expect(failure.message).toBe("CLOUDRU_JOB_UNKNOWN_FAILURE");
 });
});

describe("permanent Cloud.ru rejection", () => {
 it.each(["400","401","403","404","410","422"])("never retries confirmed Cloud.ru %s", code => {
  const failure = safeCloudruWakeFailure(Error(`CLOUDRU_JOB_EXECUTION_FAILED_gafus-chat-video-2_${code}`));
  expect(failure).toBeInstanceOf(UnrecoverableError);
  expect(failure.message).toBe("CLOUDRU_JOB_EXECUTION_PERMANENT_REJECTION");
 });
});


describe("Cloud.ru IAM authorization requires intervention", () => {
 it.each([401, 403])("does not retry a rejected IAM credential (%i)", status => {
  const failure = safeCloudruWakeFailure(Error(`CLOUDRU_JOB_IAM_UNAVAILABLE_${status}`));
  expect(failure).toBeInstanceOf(UnrecoverableError);
  expect(failure.message).toBe("CLOUDRU_JOB_IAM_AUTH_REJECTED");
 });
});
