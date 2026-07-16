import ExpoModulesCore
import UIKit
import YooKassaPayments

public final class GafusYooKassaPaymentsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    YKSdk.shared.handleOpen(
      url: url,
      sourceApplication: options[.sourceApplication] as? String
    )
  }
}
