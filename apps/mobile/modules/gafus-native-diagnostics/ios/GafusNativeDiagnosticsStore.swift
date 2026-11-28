import Foundation
import MetricKit
import CryptoKit

/// Persist only bounded, version-fenced counters, never MetricKit JSON or stacks.
/// Delivery is asynchronous and may describe an earlier interval, not this launch.
final class GafusNativeDiagnosticsStore: NSObject, MXMetricManagerSubscriber {
  static let shared = GafusNativeDiagnosticsStore()
  private let lock = NSLock()
  private let defaults = UserDefaults.standard
  private let key = "gafus.native-diagnostics.pending.v1"
  private let ackKey = "gafus.native-diagnostics.ack.v1"
  private let seedKey = "gafus.native-diagnostics.seed.v1"
  private var build: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "" }
  private var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }
  private let window: TimeInterval = 7 * 86400 - 60

  private func matches(_ buildVersion: String, _ appVersion: String) -> Bool {
    !build.isEmpty && !version.isEmpty && buildVersion == build && (appVersion == version || appVersion == build)
  }

  func didReceive(_ payloads: [MXMetricPayload]) {
    for payload in payloads {
      // Mixed versions or absent build metadata cannot be attributed reliably.
      guard !payload.includesMultipleApplicationVersions,
            let metadata = payload.metaData,
            matches(metadata.applicationBuildVersion, payload.latestApplicationVersion),
            let exits = payload.applicationExitMetrics else { continue }
      let foreground = exits.foregroundExitData
      let background = exits.backgroundExitData
      let memory = UInt64(foreground.cumulativeMemoryResourceLimitExitCount)
        + UInt64(background.cumulativeMemoryResourceLimitExitCount)
        + UInt64(background.cumulativeMemoryPressureExitCount)
      let watchdog = UInt64(foreground.cumulativeAppWatchdogExitCount)
        + UInt64(background.cumulativeAppWatchdogExitCount)
      append("IOS_MEMORY_EXIT", count: memory, begin: payload.timeStampBegin, end: payload.timeStampEnd)
      append("IOS_WATCHDOG_EXIT", count: watchdog, begin: payload.timeStampBegin, end: payload.timeStampEnd)
    }
  }

  func didReceive(_ payloads: [MXDiagnosticPayload]) {
    for payload in payloads {
      let hangs = (payload.hangDiagnostics ?? []).filter {
        matches($0.metaData.applicationBuildVersion, $0.applicationVersion)
      }
      append("IOS_HANG_DIAGNOSTIC", count: UInt64(hangs.count), begin: payload.timeStampBegin, end: payload.timeStampEnd)
    }
  }

  private func append(_ code: String, count: UInt64, begin: Date, end: Date) {
    let now = Date()
    guard count > 0, end <= now, now.timeIntervalSince(end) <= window, begin <= end else { return }
    lock.lock(); defer { lock.unlock() }
    let seed = defaults.string(forKey: seedKey) ?? UUID().uuidString
    defaults.set(seed, forKey: seedKey)
    let input = "\(seed):\(build):\(code):\(begin.timeIntervalSince1970):\(end.timeIntervalSince1970)"
    let digest = SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    let chars = Array(digest)
    let id = String(chars[0..<8]) + "-" + String(chars[8..<12]) + "-4" + String(chars[13..<16])
      + "-8" + String(chars[17..<20]) + "-" + String(chars[20..<32])
    let ack = defaults.stringArray(forKey: ackKey) ?? []
    var pending = read()
    guard !ack.contains(id), !pending.contains(where: { ($0["id"] as? String) == id }) else { return }
    pending.append(["id": id, "code": code, "timestampMs": end.timeIntervalSince1970 * 1000,
                    "count": Int(min(count, 1000)), "build": build, "appVersion": version])
    defaults.set(Array(pending.suffix(64)), forKey: key)
  }

  private func read() -> [[String: Any]] {
    let nowMs = Date().timeIntervalSince1970 * 1000
    return (defaults.array(forKey: key) as? [[String: Any]] ?? []).filter {
      ($0["build"] as? String) == build && ($0["appVersion"] as? String) == version &&
      ($0["timestampMs"] as? Double).map { $0 <= nowMs && nowMs - $0 <= window * 1000 } == true
    }
  }

  func pending() -> [[String: Any]] {
    lock.lock(); defer { lock.unlock() }
    return read()
  }

  func acknowledge(_ ids: [String]) {
    lock.lock(); defer { lock.unlock() }
    let valid = Set(ids.prefix(64).filter { UUID(uuidString: $0) != nil })
    let old = defaults.stringArray(forKey: ackKey) ?? []
    // Commit acknowledgement before removal so duplicate MetricKit delivery
    // cannot recreate a transferred record.
    defaults.set(Array((old + valid.sorted()).suffix(128)), forKey: ackKey)
    defaults.set(read().filter { !valid.contains($0["id"] as? String ?? "") }, forKey: key)
  }
}
