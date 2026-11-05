package ru.gafus.app.walk;

/** Standalone JVM contract tests; no emulator needed for pure counter arithmetic. */
public final class DogWalkCounterMathTest {
    private static void equal(int expected, int actual, String label) {
        if (expected != actual) throw new AssertionError(label + ": expected " + expected + ", got " + actual);
    }
    public static void main(String[] args) {
        equal(0, DogWalkCounterMath.add(0, -1, 100), "initial hardware baseline");
        equal(5, DogWalkCounterMath.add(0, 100, 105), "five active steps");
        equal(13, DogWalkCounterMath.add(13, -1, 125), "no steps on resumed baseline");
        equal(19, DogWalkCounterMath.add(13, 125, 131), "steps after resume");
        equal(25, DogWalkCounterMath.add(19, 131, 137), "recover a gap across service restart");
        equal(19, DogWalkCounterMath.add(19, 137, 5), "do not add reboot counter reset");
        equal(2_000_000, DogWalkCounterMath.add(1_999_999, 5, 200), "limit sensor overflow");
        equal(0, DogWalkCounterMath.add(0, -1, 0), "zero baseline");
        System.out.println("DOG_WALK_NATIVE_COUNTER_MATH_PASS: 9 cases");
    }
}
