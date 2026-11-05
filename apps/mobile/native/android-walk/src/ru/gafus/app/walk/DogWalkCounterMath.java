package ru.gafus.app.walk;

/** Pure step-counter arithmetic for crash/restart/pause-safe accumulation. */
final class DogWalkCounterMath {
    private DogWalkCounterMath() { }
    static int add(int committed, long previousCounter, long nextCounter) {
        // First reading after Start/Resume is the new baseline. A hardware
        // counter reset (usually a reboot) must not generate bogus steps.
        if (previousCounter < 0 || nextCounter < 0 || nextCounter < previousCounter) {
            return Math.max(0, committed);
        }
        return (int) Math.min(2_000_000L,
            Math.max(0L, committed) + nextCounter - previousCounter);
    }
}
