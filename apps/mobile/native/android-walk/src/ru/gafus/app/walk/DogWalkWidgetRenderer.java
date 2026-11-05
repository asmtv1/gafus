package ru.gafus.app.walk;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONException;
import org.json.JSONObject;
import ru.gafus.app.R;
import ru.gafus.app.widget.DogWalk;

/** Truly native, bounded home-screen card with independent background actions. */
public final class DogWalkWidgetRenderer {
    private static final String PREF = "gafus_walk_widget_native_v1";
    private static final String KEY = "snapshot";
    private static final String ACTION = "WALK_CONTROL";

    private DogWalkWidgetRenderer() {}

    public static void publish(Context context, String json) throws JSONException {
        // Validate before replacing the last known good snapshot.
        JSONObject data = new JSONObject(json);
        if (!data.has("active") || !data.has("running")
            || !data.has("displayStartMs") || !data.has("displayEndMs")) {
            throw new JSONException("Invalid walk widget snapshot");
        }
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString(KEY, json).commit();
        update(context);
    }

    public static void update(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, DogWalk.class));
        update(context, ids);
    }

    public static void update(Context context, int[] ids) {
        if (ids == null || ids.length == 0) return;
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        SharedPreferences p = context.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        JSONObject snapshot;
        try {
            snapshot = new JSONObject(p.getString(KEY, "{}"));
        } catch (JSONException badData) {
            snapshot = new JSONObject();
        }
        boolean active = snapshot.optBoolean("active", false);
        boolean running = active && snapshot.optBoolean("running", false);
        boolean countdown = "countdown".equals(snapshot.optString("mode", "stopwatch"));
        long now = System.currentTimeMillis();
        long uptime = SystemClock.elapsedRealtime();
        long base = countdown
            ? uptime + Math.max(0L, snapshot.optLong("displayEndMs", now) - now)
            : uptime - Math.max(0L, now - snapshot.optLong("displayStartMs", now));
        String steps = snapshot.optString("stepsLabel", "0");
        String meters = snapshot.optString("metersLabel", "0 м");
        // The system may recreate the widget after an orientation/launcher
        // change while JS is dead. The foreground step service is authoritative.
        if (active && DogWalkStepState.isRunning(context)) {
            int liveSteps = DogWalkStepState.steps(context);
            String numeric = steps.replaceAll("[^0-9]", "");
            int savedSteps = 0;
            try { savedSteps = Integer.parseInt(numeric); }
            catch (NumberFormatException ignored) { /* safe empty value */ }
            if (liveSteps > savedSteps) {
                steps = Integer.toString(liveSteps);
                meters = Math.round(liveSteps * 0.8) + " м";
            }
        }

        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.gafus_walk_widget);
            views.setTextViewText(R.id.gafus_walk_title,
                "🐕 Прогулка · " + (countdown ? "обратный" : "обычный"));
            views.setChronometerCountDown(R.id.gafus_walk_chronometer, countdown);
            views.setChronometer(R.id.gafus_walk_chronometer, base, null,
                running && (!countdown || snapshot.optLong("displayEndMs", now) > now));
            views.setTextViewText(R.id.gafus_walk_metrics,
                "🐾 " + steps + " шагов · ≈ " + meters);
            views.setViewVisibility(R.id.gafus_walk_warning,
                snapshot.optBoolean("incomplete", false) ? View.VISIBLE : View.GONE);
            views.setTextViewText(R.id.gafus_walk_start, active && !running ? "▶ Дальше" : "▶ Старт");
            addAction(context, views, id, R.id.gafus_walk_start, "start");
            addAction(context, views, id, R.id.gafus_walk_pause, "pause");
            addAction(context, views, id, R.id.gafus_walk_finish, "finish");
            manager.updateAppWidget(id, views);
        }
    }

    private static void addAction(Context context, RemoteViews views, int widgetId, int buttonId, String action) {
        Intent intent = new Intent(context.getPackageName() + ".WIDGET_CLICK");
        intent.setComponent(new ComponentName(context, DogWalk.class));
        // PendingIntent identity must differ per widget AND per control.
        intent.setData(new Uri.Builder().scheme("gafuswalk")
            .authority(context.getPackageName()).appendPath(Integer.toString(widgetId))
            .appendPath(action).build());
        intent.putExtra("widgetId", widgetId);
        intent.putExtra("clickAction", ACTION);
        Bundle extras = new Bundle();
        extras.putString("action", action);
        intent.putExtra("clickActionData", extras);
        PendingIntent click = PendingIntent.getBroadcast(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(buttonId, click);
    }
}
