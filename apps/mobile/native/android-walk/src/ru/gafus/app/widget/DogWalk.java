package ru.gafus.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.os.Bundle;
import com.reactnativeandroidwidget.RNWidgetProvider;
import ru.gafus.app.walk.DogWalkWidgetRenderer;

/**
 * Native layout is the single source of the visual widget; no bitmap or
 * overlaid TextViews may escape the launcher-assigned bounds.
 * RNWidgetProvider is kept for its secure background JS click-task dispatch.
 */
public final class DogWalk extends RNWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        super.onUpdate(context, manager, ids);
        DogWalkWidgetRenderer.update(context, ids);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager,
                                                     int id, Bundle options) {
        super.onAppWidgetOptionsChanged(context, manager, id, options);
        DogWalkWidgetRenderer.update(context, new int[] { id });
    }
}
