//
//  LaChartWorkoutPlanPlugin.swift
//  App
//
//  Capacitor plugin that turns a LaChart planned workout into a
//  WorkoutKit `CustomWorkout` and schedules it via `WorkoutScheduler`.
//  Once scheduled it appears in the Apple Workout app on the paired
//  Apple Watch (and as a notification), ready to start with one tap.
//
//  Requires iOS 17 / watchOS 10 (WorkoutKit). All WorkoutKit usage is
//  guarded by `@available` so the app still builds/runs on older iOS.
//
//  JS side: client/src/services/appleWorkoutPlan.js
//
//  ⚠️ Xcode wiring (must be done in Xcode, cannot be verified from JS):
//     1. Add this file + LaChartWorkoutPlanPlugin.m to the App target's
//        "Compile Sources" build phase.
//     2. WorkoutKit + HealthKit are system frameworks — Swift auto-links
//        them on `import`, but confirm under "Frameworks, Libraries…".
//     3. App target deployment target should allow iOS 17 features
//        (code is @available-guarded, so older targets still build).
//

import Foundation
import Capacitor
import HealthKit
#if canImport(WorkoutKit)
import WorkoutKit
#endif

@objc(LaChartWorkoutPlanPlugin)
public class LaChartWorkoutPlanPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "LaChartWorkoutPlanPlugin"
    public let jsName = "LaChartWorkoutPlan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleWorkout",      returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Availability

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(WorkoutKit)
        if #available(iOS 17.0, *) {
            call.resolve(["available": true])
            return
        }
        #endif
        call.resolve(["available": false])
    }

    // MARK: - Authorization

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        #if canImport(WorkoutKit)
        if #available(iOS 17.0, *) {
            Task {
                let state = await WorkoutScheduler.shared.requestAuthorization()
                let granted = (state == .authorized)
                call.resolve(["granted": granted, "status": String(describing: state)])
            }
            return
        }
        #endif
        call.resolve(["granted": false, "status": "unsupported"])
    }

    // MARK: - Schedule

    @objc func scheduleWorkout(_ call: CAPPluginCall) {
        #if canImport(WorkoutKit)
        guard #available(iOS 17.0, *) else {
            call.reject("WorkoutKit requires iOS 17 / watchOS 10 or later.")
            return
        }

        let activityStr = call.getString("activity") ?? "other"
        let displayName = call.getString("displayName") ?? "LaChart workout"
        let locationStr = call.getString("location") ?? "outdoor"
        let rawSteps = call.getArray("steps") ?? []
        let dateIso = call.getString("dateIso")

        let activity = Self.activityType(from: activityStr)
        let location: HKWorkoutSessionLocationType = (locationStr == "indoor") ? .indoor : .outdoor

        // Parse incoming step dicts.
        struct ParsedStep { let kind: String; let label: String; let seconds: Double; let alert: (any WorkoutAlert)? }
        var parsed: [ParsedStep] = []
        for item in rawSteps {
            guard let dict = item as? [String: Any] else { continue }
            let kind = (dict["kind"] as? String) ?? "work"
            let label = (dict["label"] as? String) ?? ""
            let seconds = Self.double(dict["durationSeconds"]) ?? 0
            guard seconds > 0 else { continue }
            let alert = Self.makeAlert(dict["alert"] as? [String: Any])
            parsed.append(ParsedStep(kind: kind, label: label, seconds: seconds, alert: alert))
        }

        guard !parsed.isEmpty else {
            call.reject("Planned workout has no usable steps.")
            return
        }

        // Split leading warm-up + trailing cool-down out of the interval block.
        var warmupStep: WorkoutStep? = nil
        var cooldownStep: WorkoutStep? = nil
        var middle = parsed

        if middle.count > 1, middle.first?.kind == "warmup" {
            let s = middle.removeFirst()
            // displayName on WorkoutStep requires iOS 18+; iOS 17 uses goal + alert only.
            warmupStep = WorkoutStep(goal: .time(s.seconds, .seconds), alert: s.alert)
        }
        if middle.count > 1, middle.last?.kind == "cooldown" {
            let s = middle.removeLast()
            cooldownStep = WorkoutStep(goal: .time(s.seconds, .seconds), alert: s.alert)
        }

        // If everything was consumed by warm-up/cool-down, keep them as the body.
        if middle.isEmpty {
            middle = parsed
            warmupStep = nil
            cooldownStep = nil
        }

        let intervalSteps: [IntervalStep] = middle.map { s in
            let purpose: IntervalStep.Purpose = (s.kind == "recovery" || s.kind == "rest") ? .recovery : .work
            return IntervalStep(purpose, goal: .time(s.seconds, .seconds), alert: s.alert)
        }
        let block = IntervalBlock(steps: intervalSteps, iterations: 1)

        let custom = CustomWorkout(
            activity: activity,
            location: location,
            displayName: displayName,
            warmup: warmupStep,
            blocks: [block],
            cooldown: cooldownStep
        )

        let plan = WorkoutPlan(.custom(custom))

        // Build the schedule date components (defaults to ~now if not given).
        var comps: DateComponents
        if let iso = dateIso, let date = ISO8601DateFormatter().date(from: iso) {
            comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        } else {
            comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: Date())
        }

        Task {
            // Require scheduling authorization first.
            var state = await WorkoutScheduler.shared.authorizationState
            if state != .authorized {
                state = await WorkoutScheduler.shared.requestAuthorization()
            }
            guard state == .authorized else {
                call.reject("Workout scheduling not authorized. Enable it for LaChart in the Watch app.", "not_authorized")
                return
            }
            do {
                try await WorkoutScheduler.shared.schedule(plan, at: comps)
                call.resolve(["scheduled": true])
            } catch {
                call.reject("Failed to schedule workout: \(error.localizedDescription)")
            }
        }
        #else
        call.reject("WorkoutKit not available in this build.")
        #endif
    }

    // MARK: - Helpers

    private static func double(_ v: Any?) -> Double? {
        if let d = v as? Double { return d }
        if let i = v as? Int { return Double(i) }
        if let n = v as? NSNumber { return n.doubleValue }
        return nil
    }

    #if canImport(WorkoutKit)
    @available(iOS 17.0, *)
    private static func makeAlert(_ a: [String: Any]?) -> (any WorkoutAlert)? {
        guard let a,
              let metric = a["metric"] as? String,
              let low = double(a["low"]),
              let high = double(a["high"]),
              low > 0, high >= low else { return nil }
        switch metric {
        case "power":     return .power(low...high, unit: .watts)
        case "heartRate": return .heartRate(low...high)
        case "speed":     return .speed(low...high, unit: .metersPerSecond)
        default:          return nil
        }
    }
    #endif

    private static func activityType(from s: String) -> HKWorkoutActivityType {
        switch s {
        case "cycling":                      return .cycling
        case "running":                      return .running
        case "walking":                      return .walking
        case "swimming":                     return .swimming
        case "rowing":                        return .rowing
        case "crossTraining":                return .crossTraining
        case "traditionalStrengthTraining":  return .traditionalStrengthTraining
        default:                              return .other
        }
    }
}
