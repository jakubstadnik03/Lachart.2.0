//
//  LaChartSharedPlugin.swift
//  App
//
//  Capacitor plugin that writes the form/fitness cache into the App Group
//  UserDefaults so the LaChartWidget extension can read it, and pings
//  WidgetCenter to refresh the home-screen widget immediately.
//
//  Register in `Plugins.json` (Capacitor 5+) or via @objc auto-registration.
//

import Foundation
import Capacitor
import WidgetKit

@objc(LaChartSharedPlugin)
public class LaChartSharedPlugin: CAPPlugin {

    /// App Group identifier — must match the entitlement on BOTH the main
    /// app target AND the widget extension target. If you change this string
    /// here, change it in `SharedStorage.swift` too.
    private let appGroupId = "group.com.lachart.app"

    /// setFormFitness({ fitness, fatigue, form, formDelta, sparkline })
    /// JS calls this whenever the dashboard fetches /today-metrics so the
    /// widget renders the same numbers the user just saw inside the app.
    @objc func setFormFitness(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            call.reject("App Group \(appGroupId) is not configured. Enable the entitlement on both targets in Xcode.")
            return
        }
        // Workout fields are optional — JS sends null when today is a rest
        // day. We forward NSNull for those keys so JSONSerialization emits
        // `null` and the widget's Codable struct decodes them as `nil`.
        // Build with [String: Any] explicitly so the compiler doesn't infer
        // [String: Any?] which JSONSerialization refuses.
        var payload: [String: Any] = [
            "fitness":     call.getInt("fitness")    ?? 0,
            "fatigue":     call.getInt("fatigue")    ?? 0,
            "form":        call.getInt("form")       ?? 0,
            "formDelta":   call.getInt("formDelta")  ?? 0,
            "sparkline":   call.getArray("sparkline", Int.self) ?? [],
            "lastUpdated": ISO8601DateFormatter().string(from: Date()),
        ]
        payload["workoutTitle"]       = call.getString("workoutTitle")    ?? NSNull()
        payload["workoutSport"]       = call.getString("workoutSport")    ?? NSNull()
        payload["workoutCategory"]    = call.getString("workoutCategory") ?? NSNull()
        payload["workoutSubtitle"]    = call.getString("workoutSubtitle") ?? NSNull()
        if let dur = call.getInt("workoutDurationSec") { payload["workoutDurationSec"] = dur }
        else                                            { payload["workoutDurationSec"] = NSNull() }

        do {
            let data = try JSONSerialization.data(withJSONObject: payload, options: [])
            defaults.set(data, forKey: "lachart_form_fitness_cache_v1")
            // Tell iOS the widget data changed — UI will refresh on next paint
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
            call.resolve(["ok": true])
        } catch {
            call.reject("Failed to encode payload: \(error.localizedDescription)")
        }
    }

    /// Forces every LaChart widget to refresh from cache. Useful after the
    /// app clears local data (logout) or on demand from a debug menu.
    @objc func reloadWidgets(_ call: CAPPluginCall) {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }
}
