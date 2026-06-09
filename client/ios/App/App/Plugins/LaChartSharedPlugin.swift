//
//  LaChartSharedPlugin.swift
//  App
//
//  Capacitor plugin that writes the dashboard cache into the App Group
//  UserDefaults so the LaChartWidget extension can read it, and pings
//  WidgetCenter to refresh widgets immediately.
//

import Foundation
import Capacitor
import WidgetKit

@objc(LaChartSharedPlugin)
public class LaChartSharedPlugin: CAPPlugin, CAPBridgedPlugin {

    // Capacitor 6 discovers plugins via these CAPBridgedPlugin members.
    // The legacy `.m` CAP_PLUGIN macro alone is NOT reliably registered in
    // Capacitor 6 — without this conformance the JS side reports the plugin as
    // "not available" even though the class compiles into the app binary.
    public let identifier = "LaChartSharedPlugin"
    public let jsName = "LaChartShared"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setFormFitness", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reloadWidgets",  returnType: CAPPluginReturnPromise),
    ]

    /// App Group identifier — must match the entitlement on BOTH the main
    /// app target AND the widget extension target.
    private let appGroupId = "group.com.lachart.app"

    /// JS passes a single payload here covering everything the widget needs.
    /// See `client/src/utils/widgetCache.js` for the JS-side shape.
    @objc func setFormFitness(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            call.reject("App Group \(appGroupId) is not configured. Enable the entitlement on both targets in Xcode.")
            return
        }

        var payload: [String: Any] = [
            "fitness":     call.getInt("fitness")    ?? 0,
            "fatigue":     call.getInt("fatigue")    ?? 0,
            "form":        call.getInt("form")       ?? 0,
            "formDelta":   call.getInt("formDelta")  ?? 0,
            "sparkline":   call.getArray("sparkline", Int.self) ?? [],
            "lastUpdated": ISO8601DateFormatter().string(from: Date()),
        ]

        // Today's completed + planned workouts — each is an array of dicts
        // matching the WidgetWorkout Codable shape on the Swift side.
        payload["todayCompleted"]  = normaliseWorkouts(call.getArray("todayCompleted")  ?? [])
        payload["todayPlanned"]    = normaliseWorkouts(call.getArray("todayPlanned")    ?? [])
        payload["tomorrowPlanned"] = normaliseWorkouts(call.getArray("tomorrowPlanned") ?? [])

        do {
            let data = try JSONSerialization.data(withJSONObject: payload, options: [])
            defaults.set(data, forKey: "lachart_form_fitness_cache_v1")
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
            call.resolve(["ok": true, "bytes": data.count])
        } catch {
            call.reject("Failed to encode payload: \(error.localizedDescription)")
        }
    }

    /// Force-refresh all LaChart widgets. Used on logout / debug menu.
    @objc func reloadWidgets(_ call: CAPPluginCall) {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }

    // MARK: - Helpers

    /// Coerce a JS array of workouts into a sanitised array of
    /// `[String: Any]` ready for JSONSerialization. NSNull stands in for
    /// nil-able optional fields so the Codable struct decodes them as
    /// Swift `nil` rather than crashing with "key not found".
    private func normaliseWorkouts(_ raw: [Any]) -> [[String: Any]] {
        return raw.compactMap { item -> [String: Any]? in
            guard let dict = item as? [String: Any] else { return nil }
            var out: [String: Any] = [:]
            out["title"]    = (dict["title"] as? String) ?? "Workout"
            out["sport"]    = (dict["sport"] as? String) ?? NSNull()
            out["category"] = (dict["category"] as? String) ?? NSNull()
            out["subtitle"] = (dict["subtitle"] as? String) ?? NSNull()
            out["id"]       = (dict["id"] as? String) ?? NSNull()
            out["planned"]  = (dict["planned"] as? Bool) ?? false
            if let dur = dict["durationSec"] as? Int {
                out["durationSec"] = dur
            } else if let durDouble = dict["durationSec"] as? Double {
                out["durationSec"] = Int(durDouble)
            } else {
                out["durationSec"] = NSNull()
            }
            return out
        }
    }
}
