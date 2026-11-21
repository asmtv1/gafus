package ru.gafus.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.os.Bundle;
import com.reactnativeandroidwidget.RNWidgetProvider;
import ru.gafus.app.walk.DogWalkWidgetRenderer;

/**
 * Native layout is the single source of the visual widget; no bitmap or
 * overlaid TextViews may escape the launcher-assigned bounds.
 * RNWidgetProvider is retained only for background JS click-task dispatch.
 * Its legacy update/resize handlers must not enqueue React bitmap rendering:
 * that renderer races and can overwrite this native RemoteViews card.
 */
public final class DogWalk extends RNWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        // Native RemoteViews owns this update. Do not queue legacy RN rendering.
        DogWalkWidgetRenderer.update(context, ids);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager,
                                                     int id, Bundle options) {
        // Ignore the old bitmap-based size worker; the native layout adapts itself.
        DogWalkWidgetRenderer.update(context, new int[] { id });
    }
}
