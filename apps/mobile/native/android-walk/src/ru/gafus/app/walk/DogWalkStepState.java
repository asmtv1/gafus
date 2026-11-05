package ru.gafus.app.walk;

import android.content.Context;
import android.content.SharedPreferences;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;

/** Durable state shared by React and the foreground Service, keyed by owner + walk UUID. */
final class DogWalkStepState {
    private static final String PREFS = "gafus_dog_walk_steps_v1";
    private static final Object LOCK = new Object();
    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
    static WritableMap snapshot(Context c) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            WritableMap map = Arguments.createMap();
            map.putString("ownerId", p.getString("ownerId", ""));
            map.putString("walkId", p.getString("walkId", ""));
            map.putInt("steps", Math.max(0, p.getInt("steps", 0)));
            map.putBoolean("running", p.getBoolean("running", false));
            map.putBoolean("incomplete", p.getBoolean("incomplete", false));
            map.putString("sensor", p.getString("sensor", "none"));
            return map;
        }
    }
    static boolean isRunning(Context c) {
        synchronized (LOCK) { return prefs(c).getBoolean("running", false); }
    }
    static String sensor(Context c) {
        synchronized (LOCK) { return prefs(c).getString("sensor", "none"); }
    }
    static boolean wasSensorRegistered(Context c) {
        synchronized (LOCK) { return prefs(c).getBoolean("sensorRegistered", false); }
    }
    static void sensorRegistered(Context c) {
        synchronized (LOCK) { prefs(c).edit().putBoolean("sensorRegistered", true).apply(); }
    }
    static int steps(Context c) {
        synchronized (LOCK) { return Math.max(0, prefs(c).getInt("steps", 0)); }
    }
    static void start(Context c, String ownerId, String walkId, int initialSteps, String sensor) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            boolean same = ownerId.equals(p.getString("ownerId", "")) &&
                walkId.equals(p.getString("walkId", ""));
            boolean wasRunning = same && p.getBoolean("running", false);
            SharedPreferences.Editor e = p.edit()
                .putString("ownerId", ownerId).putString("walkId", walkId)
                .putBoolean("running", true).putString("sensor", sensor)
                .putInt("steps", Math.max(0, Math.max(initialSteps, same ? p.getInt("steps", 0) : 0)));
            if (!wasRunning) e.putLong("lastCounter", -1L).putBoolean("sensorRegistered", false);
            if (!same) e.putBoolean("incomplete", false);
            e.commit();
        }
    }
    static void pause(Context c, String ownerId, String walkId) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            if (!ownerId.equals(p.getString("ownerId", "")) ||
                !walkId.equals(p.getString("walkId", ""))) {
                throw new IllegalStateException("WALK_ACTOR_MISMATCH");
            }
            p.edit().putBoolean("running", false).commit();
        }
    }
    static void pauseAny(Context c) {
        synchronized (LOCK) { prefs(c).edit().putBoolean("running", false).commit(); }
    }
    /** Prevent a stale account-switch callback from stopping a new owner's walk. */
    static boolean pauseIfOwner(Context c, String expectedOwnerId) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            if (!expectedOwnerId.equals(p.getString("ownerId", ""))) return false;
            p.edit().putBoolean("running", false).commit();
            return true;
        }
    }
    static void incomplete(Context c) {
        synchronized (LOCK) { prefs(c).edit().putBoolean("incomplete", true).apply(); }
    }
    static void sample(Context c, int type, float sensorValue) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            if (!p.getBoolean("running", false)) return;
            String mode = p.getString("sensor", "none");
            int steps = Math.max(0, p.getInt("steps", 0));
            SharedPreferences.Editor e = p.edit();
            if (type == android.hardware.Sensor.TYPE_STEP_COUNTER && "counter".equals(mode)) {
                long value = (long) sensorValue;
                if (value < 0) return;
                long previous = p.getLong("lastCounter", -1L);
                if (previous >= 0 && value >= previous) {
                    steps = DogWalkCounterMath.add(steps, previous, value);
                } else if (previous >= 0) {
                    e.putBoolean("incomplete", true); // reboot or counter reset
                }
                e.putLong("lastCounter", value);
            } else if (type == android.hardware.Sensor.TYPE_STEP_DETECTOR && "detector".equals(mode)) {
                steps = Math.min(2_000_000, steps + 1);

            } else return;
            e.putInt("steps", steps).apply();
        }
    }
}
