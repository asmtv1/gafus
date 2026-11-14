package ru.gafus.app.startup;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.uimanager.ViewManager;
import java.util.Collections;
import java.util.List;

/** One-way native handoff: JavaScript may dismiss the poster only once the first route is ready. */
public final class GafusStartupPackage implements ReactPackage {
  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    return Collections.singletonList(new GafusStartupModule(context));
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.emptyList();
  }

  private static final class GafusStartupModule extends ReactContextBaseJavaModule {
    GafusStartupModule(ReactApplicationContext context) { super(context); }

    @Override
    public String getName() { return "GafusStartupPoster"; }

    @ReactMethod
    public void hide() {
      final android.app.Activity activity = getCurrentActivity();
      if (activity != null) activity.runOnUiThread(() -> GafusStartupPoster.hide(activity));
    }
  }
}
