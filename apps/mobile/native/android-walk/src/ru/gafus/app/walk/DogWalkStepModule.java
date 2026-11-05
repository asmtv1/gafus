package ru.gafus.app.walk;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/** React bridge: session actions can only target the matching local owner and walk UUID. */
public final class DogWalkStepModule extends ReactContextBaseJavaModule {
    DogWalkStepModule(ReactApplicationContext context) { super(context); }
    @NonNull @Override public String getName() { return "GafusDogWalkSteps"; }

    private String availableSensor() {
        Context context = getReactApplicationContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION)
                != PackageManager.PERMISSION_GRANTED) return "permission";
        SensorManager manager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        if (manager == null) return "none";
        if (manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null) return "counter";
        if (manager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) != null) return "detector";
        return "none";
    }
    /** Publish a single native widget tree; bitmap overlays are no longer used. */
    @ReactMethod public void publishWidget(String snapshotJson, Promise promise) {
        try {
            DogWalkWidgetRenderer.publish(getReactApplicationContext(), snapshotJson);
            promise.resolve(true);
        } catch (Exception error) {
            promise.reject("WALK_WIDGET_RENDER_FAILED", error);
        }
    }
    @ReactMethod public void availability(Promise promise) { promise.resolve(availableSensor()); }
    @ReactMethod public void snapshot(Promise promise) {
        promise.resolve(DogWalkStepState.snapshot(getReactApplicationContext()));
    }
    @ReactMethod public void start(String ownerId, String walkId, int steps, Promise promise) {
        String sensor = availableSensor();
        if ("none".equals(sensor) || "permission".equals(sensor)) {
            promise.reject("WALK_SENSOR_UNAVAILABLE", "Activity permission or step sensor unavailable: " + sensor);
            return;
        }
        if (ownerId == null || ownerId.isEmpty() || walkId == null || walkId.isEmpty() || steps < 0) {
            promise.reject("WALK_INVALID_SESSION", "Invalid owner, walk, or initial steps");
            return;
        }
        Context context = getReactApplicationContext();
        try {
            DogWalkStepState.start(context, ownerId, walkId, steps, sensor);
            Intent intent = new Intent(context, DogWalkStepService.class).setAction(DogWalkStepService.ACTION_TRACK);
            ContextCompat.startForegroundService(context, intent);
            promise.resolve(DogWalkStepState.snapshot(context));
        } catch (RuntimeException error) {
            DogWalkStepState.incomplete(context);
            DogWalkStepState.pauseAny(context);
            promise.reject("WALK_SERVICE_START_FAILED", error);
        }
    }
    @ReactMethod public void pause(String ownerId, String walkId, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            DogWalkStepState.pause(context, ownerId, walkId);
            context.stopService(new Intent(context, DogWalkStepService.class));
            promise.resolve(DogWalkStepState.snapshot(context));
        } catch (RuntimeException error) { promise.reject("WALK_PAUSE_FAILED", error); }
    }
    @ReactMethod public void finish(String ownerId, String walkId, Promise promise) {
        pause(ownerId, walkId, promise); // Retain snapshot in case the app dies before persisting.
    }
    @ReactMethod public void pauseAny(String expectedOwnerId, Promise promise) {
        Context context = getReactApplicationContext();
        if (expectedOwnerId == null || expectedOwnerId.isEmpty()) {
            promise.reject("WALK_OWNER_REQUIRED", "A stored walk owner is required");
            return;
        }
        boolean paused = DogWalkStepState.pauseIfOwner(context, expectedOwnerId);
        if (paused) context.stopService(new Intent(context, DogWalkStepService.class));
        promise.resolve(paused);
    }
}
