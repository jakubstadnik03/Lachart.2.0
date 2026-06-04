// RunNotification.swift
// LaChartWatch
//
// In-workout notification model surfaced on the far-left pane of the run
// screen (RunNotificationsView). Kept deliberately simple — we don't try
// to read the system notification center (not allowed for third-party
// watchOS apps), only the events LaChart itself raises during the run:
// lap markers, lactate prompts, BLE disconnects, coach pushes.

import SwiftUI

struct RunNotification: Identifiable, Equatable {
    let id        = UUID()
    let title:    String
    let body:     String
    let icon:     String      // SF Symbol
    let tint:     Color
    let when:     Date

    static func lap(_ number: Int, paceSec: TimeInterval) -> RunNotification {
        let m  = Int(paceSec) / 60
        let s  = String(format: "%02d", Int(paceSec) % 60)
        return RunNotification(
            title: "Lap \(number)",
            body:  "Pace \(m):\(s) /km",
            icon:  "flag.fill",
            tint:  .lcPrimaryLite,
            when:  Date()
        )
    }

    static func lactatePrompt() -> RunNotification {
        RunNotification(
            title: "Log lactate?",
            body:  "Open LaChart on iPhone to capture a reading.",
            icon:  "drop.fill",
            tint:  .red,
            when:  Date()
        )
    }

    static func sensorLost(_ name: String) -> RunNotification {
        RunNotification(
            title: "\(name) lost",
            body:  "Sensor disconnected — tap Sensors to retry.",
            icon:  "antenna.radiowaves.left.and.right.slash",
            tint:  .orange,
            when:  Date()
        )
    }
}

// AppState extension — append-only ring buffer (newest first, cap 10).
extension AppState {
    /// Convenience accessor — read from `_runNotifications` stored elsewhere
    /// (in AppState.swift itself we'd add `@Published var _runNotifications`).
    /// To avoid an invasive edit we hold the buffer in a static for now;
    /// AppState consumers see it via `runNotifications`.
    var runNotifications: [RunNotification] {
        get { RunNotificationStore.shared.items }
    }

    func pushRunNotification(_ n: RunNotification) {
        RunNotificationStore.shared.push(n)
        objectWillChange.send()
    }

    func clearRunNotifications() {
        RunNotificationStore.shared.clear()
        objectWillChange.send()
    }
}

/// Tiny standalone store so we don't need to touch AppState.swift's
/// property list. Holds the last 10 notifications in memory only — they
/// reset when the watch app cold-starts (which is fine; they're ephemeral
/// in-workout messages, not real notifications).
final class RunNotificationStore {
    static let shared = RunNotificationStore()
    private(set) var items: [RunNotification] = []

    func push(_ n: RunNotification) {
        items.insert(n, at: 0)
        if items.count > 10 { items.removeLast(items.count - 10) }
    }
    func clear() { items.removeAll() }
}
