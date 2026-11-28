import ExpoModulesCore
import MetricKit
import UIKit

public final class GafusMetricSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication,
      didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    MXMetricManager.shared.add(GafusNativeDiagnosticsStore.shared)
    return true
  }
}

public final class GafusNativeDiagnosticsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GafusNativeDiagnostics")
    AsyncFunction("pending") { GafusNativeDiagnosticsStore.shared.pending() }
    AsyncFunction("acknowledge") { (ids: [String]) in GafusNativeDiagnosticsStore.shared.acknowledge(ids) }
  }
}
