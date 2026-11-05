package ru.gafus.app.walk;

import android.Manifest;
import android.app.Notification;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.widget.RemoteViews;
import android.view.View;
import ru.gafus.app.R;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/** Keeps the step sensor subscribed after the screen turns off or React exits. */
public final class DogWalkStepService extends Service implements SensorEventListener {
    static final String ACTION_TRACK = "ru.gafus.app.walk.TRACK";
    private static final String CHANNEL = "gafus-dog-walk-running";
    private static final int NOTIFICATION_ID = 7104;
    private SensorManager sensorManager;
    private Sensor sensor;
    private NotificationManager notificationManager;
    private PendingIntent openWalk;
    private long lastNotificationAt;
    private int lastNotificationSteps = -1;

    @Override public void onCreate() {
        super.onCreate();
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!DogWalkStepState.isRunning(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) {
            DogWalkStepState.incomplete(this);
            DogWalkStepState.pauseAny(this);
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(CHANNEL, "Прогулка с собакой",
                    NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("Подсчёт шагов во время активной прогулки");
                notificationManager.createNotificationChannel(channel);
            }
            // Open the actual walk, not the app's unrelated home screen.
            Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("gafus://walk"));
            open.setPackage(getPackageName());
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            openWalk = PendingIntent.getActivity(this, 7104, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification notification = buildOngoingNotification(DogWalkStepState.steps(this));
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            // A new Service instance means the prior listener stopped. Even
            // TYPE_STEP_COUNTER may not include footsteps taken while that
            // listener was absent; explicitly flag the unknown gap.
            if (sensor == null && DogWalkStepState.wasSensorRegistered(this)) {
                DogWalkStepState.incomplete(this);
            }
            if (sensor != null) sensorManager.unregisterListener(this);
            sensor = "counter".equals(DogWalkStepState.sensor(this))
                ? sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
                : sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
            if (sensor == null || !sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)) {
                DogWalkStepState.incomplete(this);
                DogWalkStepState.pauseAny(this);
                stopSelf();
                return START_NOT_STICKY;
            }
            DogWalkStepState.sensorRegistered(this);
            updateWidgetMetrics(DogWalkStepState.steps(this));
        } catch (RuntimeException error) {
            Log.e("DogWalkSteps", "Unable to start motion foreground service", error);
            DogWalkStepState.incomplete(this);
            DogWalkStepState.pauseAny(this);
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    private Notification buildOngoingNotification(int steps) {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        builder.setContentTitle("Прогулка с собакой")
            .setContentText(steps + " шагов · ≈ " + Math.round(steps * 0.8) + " м")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true).setCategory(Notification.CATEGORY_SERVICE)
            .setShowWhen(false);
        if (openWalk != null) builder.setContentIntent(openWalk);
        return builder.build();
    }

    private void updateWidgetMetrics(int steps) {
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(this);
            ComponentName receiver = new ComponentName(getPackageName(), getPackageName() + ".widget.DogWalk");
            int[] ids = manager.getAppWidgetIds(receiver);
            if (ids == null || ids.length == 0) return;
            RemoteViews views = new RemoteViews(getPackageName(), R.layout.gafus_walk_widget);
            views.setTextViewText(R.id.gafus_walk_metrics,
                "🐾 " + steps + " шагов · ≈ " + Math.round(steps * 0.8) + " м");
            // Partial update preserves the independently ticking native Chronometer
            // and the existing Start/Pause/Finish click actions from the RN widget.
            manager.partiallyUpdateAppWidget(ids, views);
        } catch (RuntimeException error) {
            Log.w("DogWalkSteps", "Could not refresh home-screen step metrics", error);
        }
    }

    @Override public void onSensorChanged(SensorEvent event) {
        if (event.values.length == 0) return;
        DogWalkStepState.sample(this, event.sensor.getType(), event.values[0]);
        int steps = DogWalkStepState.steps(this);
        long now = android.os.SystemClock.elapsedRealtime();
        // A low-priority, silent ongoing notification also shows the current
        // step total from the lock screen. Avoid updating once per footstep.
        if (steps != lastNotificationSteps && (lastNotificationSteps < 0 || now - lastNotificationAt >= 10_000L)) {
            lastNotificationSteps = steps;
            lastNotificationAt = now;
            try {
                if (notificationManager != null) notificationManager.notify(
                    NOTIFICATION_ID, buildOngoingNotification(steps));
            } catch (RuntimeException error) {
                // Notification-channel denial must never stop the step sensor.
                Log.w("DogWalkSteps", "Foreground notification refresh failed", error);
            }
            updateWidgetMetrics(steps);
        }
    }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        sensor = null;
        super.onDestroy();
    }
}
