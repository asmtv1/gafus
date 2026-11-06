import { describe, expect, it, vi } from "vitest";
import { playVideoFromBeginningIfEnded } from "./replayVideo";

describe("native progressive MP4 repeat playback", () => {
  it("restarts from zero at the end and invokes the same native player", () => {
    const player={currentTime:29.99,duration:30,play:vi.fn(),replay:vi.fn(function () { player.currentTime=0; })};
    playVideoFromBeginningIfEnded(player);
    expect(player.currentTime).toBe(0);
    expect(player.replay).toHaveBeenCalledOnce();
    expect(player.play).not.toHaveBeenCalled();
  });
  it("restarts after a playToEnd event even when the decoder reports an imprecise time", () => {
    const player={currentTime:26,duration:30,play:vi.fn(),replay:vi.fn(function () { player.currentTime=0; })};
    playVideoFromBeginningIfEnded(player,true);
    expect(player.currentTime).toBe(0);
    expect(player.replay).toHaveBeenCalledOnce();
    expect(player.play).not.toHaveBeenCalled();
  });
  it("resumes a paused video at its current position, never seeking to zero", () => {
    const player={currentTime:11,duration:30,play:vi.fn(),replay:vi.fn()};
    playVideoFromBeginningIfEnded(player);
    expect(player.currentTime).toBe(11);
    expect(player.play).toHaveBeenCalledOnce();
    expect(player.replay).not.toHaveBeenCalled();
  });
  it("handles unknown duration without erasing playback progress", () => {
    const player={currentTime:8,duration:0,play:vi.fn(),replay:vi.fn()};
    playVideoFromBeginningIfEnded(player);
    expect(player.currentTime).toBe(8);
  });
});
