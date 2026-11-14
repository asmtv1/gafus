import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  createTrainerVideoRow,
  deleteTrainerVideoRow,
  markTrainerVideoTranscodingFailedRow,
  readTrainerVideoDeleteRow,
  readTrainerVideoManifestRow,
  readTrainerVideoMetadataRow,
  readTrainerVideoOwnerRow,
  readTrainerVideoPlaybackRow,
  readTrainerVideoStatusRows,
  readTrainerVideosRows,
  renameTrainerVideoForOwner,
} from "./trainerVideoRows";

const qa = describe.runIf(process.env.GAFUS_TRAINER_VIDEO_ROWS_REAL_PG === "enabled");
const trainer1 = "trainer-video-rows-qa-first";
const trainer2 = "trainer-video-rows-qa-second";
const fileSize = Math.ceil(2.1 * 1024 * 1024 * 1024);
let firstId = "";
let secondId = "";
let verifiedDisposableDb = false;

qa("trainer-video SQL with disposable localhost PostgreSQL 18", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_trainer_video_rows_qa");
    const identity = await prisma.$queryRawUnsafe<{ db: string; version: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS version",
    );
    expect(identity[0]?.db).toBe("gafus_trainer_video_rows_qa");
    expect(identity[0]?.version).toBeGreaterThanOrEqual(180000);
    verifiedDisposableDb = true;
    await prisma.user.createMany({
      data: [
        { id: trainer1, username: trainer1, password: "test-fixture-only", role: "TRAINER" },
        { id: trainer2, username: trainer2, password: "test-fixture-only", role: "TRAINER" },
      ],
    });
    const first = await createTrainerVideoRow({
      trainerId: trainer1,
      relativePath: "qa/first.mp4",
      originalName: "first.mp4",
      mimeType: "video/mp4",
      fileSize,
    });
    const second = await createTrainerVideoRow({
      trainerId: trainer2,
      relativePath: "qa/second.mp4",
      originalName: "second.mp4",
      mimeType: "video/mp4",
      fileSize: 4321,
    });
    firstId = first.id;
    secondId = second.id;
  });
  afterAll(async () => {
    if (!verifiedDisposableDb) return;
    await prisma.trainerVideo.deleteMany({ where: { trainerId: { in: [trainer1, trainer2] } } });
    await prisma.user.deleteMany({ where: { id: { in: [trainer1, trainer2] } } });
    await prisma.$disconnect();
  });
  it("stores large file sizes exactly as bigint and exposes only the requested trainer's videos", async () => {
    const rows = await readTrainerVideosRows(trainer1, false);
    expect(rows.map((v) => v.id)).toEqual([firstId]);
    expect(rows[0]?.fileSize).toBe(BigInt(fileSize));
    const adminRows = await readTrainerVideosRows(trainer1, true);
    expect(adminRows.map((v) => v.id)).toEqual(expect.arrayContaining([firstId, secondId]));
  });
  it("prevents a different trainer from renaming a video with a SQL owner predicate", async () => {
    expect(await renameTrainerVideoForOwner(firstId, trainer2, "forbidden")).toBe(false);
    expect(
      (await prisma.trainerVideo.findUniqueOrThrow({ where: { id: firstId } })).displayName,
    ).toBeNull();
    expect(await renameTrainerVideoForOwner(firstId, trainer1, "approved")).toBe(true);
    expect(
      (await prisma.trainerVideo.findUniqueOrThrow({ where: { id: firstId } })).displayName,
    ).toBe("approved");
    expect((await readTrainerVideoOwnerRow(firstId))?.trainerId).toBe(trainer1);
  });
  it("returns projected playback status and deletion metadata without a payload leak", async () => {
    expect((await readTrainerVideoDeleteRow(firstId))?.id).toBe(firstId);
    expect(await readTrainerVideoManifestRow(firstId)).toMatchObject({
      transcodingStatus: "PENDING",
    });
    expect((await readTrainerVideoMetadataRow(firstId))?.id).toBe(firstId);
    expect(await readTrainerVideoPlaybackRow(firstId)).toMatchObject({
      transcodingStatus: "PENDING",
    });
    expect((await readTrainerVideoStatusRows([firstId])).map((v) => v.id)).toEqual([firstId]);
    await markTrainerVideoTranscodingFailedRow(firstId, "job error");
    expect(await readTrainerVideoPlaybackRow(firstId)).toMatchObject({
      transcodingStatus: "FAILED",
    });
  });
  it("deletes only requested video row, preserving the other trainer's record", async () => {
    await deleteTrainerVideoRow(firstId);
    expect(await readTrainerVideoOwnerRow(firstId)).toBeNull();
    expect((await readTrainerVideoOwnerRow(secondId))?.trainerId).toBe(trainer2);
  });
});
