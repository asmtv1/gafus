package ru.gafus.app.startup;

import android.app.Activity;
import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import java.lang.ref.WeakReference;
import ru.gafus.app.R;

/** Pre-JS Android startup image. Attached to the existing Activity, never a second Activity. */
public final class GafusStartupPoster {
  private static WeakReference<Activity> owner = new WeakReference<>(null);
  private static WeakReference<ImageView> image = new WeakReference<>(null);

  private GafusStartupPoster() {}

  public static void show(Activity activity) {
    // The Android OS splash remains responsible for the very first launch frame.
    FrameLayout decor = (FrameLayout) activity.getWindow().getDecorView();
    ImageView poster = new ImageView(activity);
    poster.setImageResource(R.drawable.gafus_startup_poster);
    poster.setScaleType(ImageView.ScaleType.CENTER_CROP);
    poster.setBackgroundColor(Color.rgb(181, 229, 235));
    poster.setClickable(true); // Avoid touches reaching an uninitialized React tree.
    decor.addView(poster, new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    owner = new WeakReference<>(activity);
    image = new WeakReference<>(poster);
  }

  public static void hide(Activity activity) {
    if (owner.get() != activity) return;
    ImageView poster = image.get();
    if (poster == null) return;
    ViewGroup parent = (ViewGroup) poster.getParent();
    if (parent != null) parent.removeView(poster);
    image.clear();
    owner.clear();
  }
}
