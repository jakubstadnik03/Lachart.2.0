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
//  This plugin is written to be RECONCILABLE, not fire-and-forget: every
//  scheduled plan carries a deterministic UUID derived from the LaChart
//  PlannedWorkout id, and `getScheduledWorkouts` / `removeWorkout` let the
//  JS layer diff its calendar against what is actually on the watch. That is
//  what makes the auto-sync in appleWatchAutoSync.js idempotent.
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
        CAPPluginMethod(name: "isAvailable",           returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuthorizationState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleWorkout",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getScheduledWorkouts",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeWorkout",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLimits",             returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Availability

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(WorkoutKit)
        if #available(iOS 17.0, *) {
            // isSupported is false without a paired Watch — the feature should be
            // hidden entirely in that case rather than failing at schedule time.
            call.resolve(["available": WorkoutScheduler.isSupported])
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

    /// Read the current authorization WITHOUT showing the system prompt.
    /// The background sync uses this so it can stay silent; only the Settings
    /// card is allowed to call `requestAuthorization`.
    @objc func getAuthorizationState(_ call: CAPPluginCall) {
        #if canImport(WorkoutKit)
        if #available(iOS 17.0, *) {
            Task {
                let state = await WorkoutScheduler.shared.authorizationState
                call.resolve([
                    "granted": state == .authorized,
                    "status": String(describing: state),
                ])
            }
            return
        }
        #endif
        call.resolve(["granted": false, "status": "unsupported"])
    }

    // MARK: - Limits

    @objc func getLimits(_ call: CAPPluginCall) {
        #if canImport(WorkoutKit)
        if #available(iOS 17.0, *) {
            call.resolve(["max": WorkoutScheduler.maxAllowedScheduledWorkoutCount])
            return
        }
        #endif
        call.resolve(["max": 0])
    }

    // MARK: - Read back what is scheduled

    @objc func getScheduledWorkouts(_ call: CAPPluginCall) {
        #if canImport(WorkoutKit)
        guard #available(iOS 17.0, *) else {
            call.resolve(["workouts": []])
            return
        }
        Task {
            let scheduled = await WorkoutScheduler.shared.scheduledWorkouts
            let out: [[String: Any]] = scheduled.compactMap { item in
                guard let date = Calendar.current.date(from: item.date) else { return nil }
                return [
                    "planId": item.plan.id.uuidString.lowercased(),
                    "dateIso": Self.iso.string(from: date),
                    "complete": item.complete,
                ]
            }
            call.resolve(["workouts": out])
        }
        #else
        call.resolve(["workouts": []])
        #endif
    }

    // MARK: - Remove

    @objc func removeWorkout(_ call: CAPPluginCall) {
        #if canImport(WorkoutKit)
        guard #available(iOS 17.0, *) else {
            call.resolve(["removed": false])
            return
        }
        guard let planIdStr = call.getString("planId"),
              let planId = UUID(uuidString: planIdStr),
              let iso = call.getString("dateIso"),
              let date = Self.iso.date(from: iso) else {
            call.reject("removeWorkout requires planId and dateIso.")
            return
        }
        let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        Task {
            // Match on the plan id we scheduled with; the date alone is not unique.
            let scheduled = await WorkoutScheduler.shared.scheduledWorkouts
            guard let match = scheduled.first(where: { $0.plan.id == planId && $0.date == comps })
                    ?? scheduled.first(where: { $0.plan.id == planId }) else {
                call.resolve(["removed": false])
                return
            }
            await WorkoutScheduler.shared.remove(match.plan, at: match.date)
            call.resolve(["removed": true])
        }
        #else
        call.resolve(["removed": false])
        #endif
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
        let dateIso = call.getString("dateIso")

        let activity = Self.activityType(from: activityStr)
        let location: HKWorkoutSessionLocationType = (locationStr == "indoor") ? .indoor : .outdoor

        // Refuse an activity WorkoutKit cannot build a custom workout for, rather
        // than letting CustomWorkout throw an opaque error at schedule time.
        guard CustomWorkout.supportsActivity(activity) else {
            call.reject("Apple Watch custom workouts do not support this sport.", "unsupported_activity")
            return
        }

        let warmupStep = Self.makeStep(call.getObject("warmup"), activity: activity, location: location)
        let cooldownStep = Self.makeStep(call.getObject("cooldown"), activity: activity, location: location)

        // Preferred shape: explicit blocks carrying native repeat counts.
        var blocks: [IntervalBlock] = []
        for rawBlock in (call.getArray("blocks") ?? []) {
            guard let dict = rawBlock as? [String: Any] else { continue }
            let iterations = max(1, Int((Self.double(dict["iterations"]) ?? 1).rounded()))
            let rawSteps = (dict["steps"] as? [Any]) ?? []
            let steps: [IntervalStep] = rawSteps.compactMap { item in
                guard let s = item as? [String: Any] else { return nil }
                return Self.makeIntervalStep(s, activity: activity, location: location)
            }
            if !steps.isEmpty {
                blocks.append(IntervalBlock(steps: steps, iterations: iterations))
            }
        }

        // Fallback for payloads from an older JS bundle that only sends `steps`.
        if blocks.isEmpty {
            let rawSteps = call.getArray("steps") ?? []
            let steps: [IntervalStep] = rawSteps.compactMap { item in
                guard let s = item as? [String: Any] else { return nil }
                return Self.makeIntervalStep(s, activity: activity, location: location)
            }
            if !steps.isEmpty { blocks.append(IntervalBlock(steps: steps, iterations: 1)) }
        }

        guard !blocks.isEmpty else {
            call.reject("Planned workout has no usable steps.")
            return
        }

        let custom = CustomWorkout(
            activity: activity,
            location: location,
            displayName: displayName,
            warmup: warmupStep,
            blocks: blocks,
            cooldown: cooldownStep
        )

        // A deterministic id lets a re-sync replace this plan instead of stacking
        // a duplicate next to it.
        let plan: WorkoutPlan
        if let idStr = call.getString("planId"), let uuid = UUID(uuidString: idStr) {
            plan = WorkoutPlan(.custom(custom), id: uuid)
        } else {
            plan = WorkoutPlan(.custom(custom))
        }

        guard let iso = dateIso, let date = Self.iso.date(from: iso) else {
            call.reject("scheduleWorkout requires a valid dateIso.")
            return
        }
        let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)

        Task {
            var state = await WorkoutScheduler.shared.authorizationState
            if state != .authorized {
                state = await WorkoutScheduler.shared.requestAuthorization()
            }
            guard state == .authorized else {
                call.reject("Workout scheduling not authorized. Enable it for LaChart in the Watch app.", "not_authorized")
                return
            }
            // Replace any previous scheduling of the same plan so an edited
            // workout does not appear twice on the watch.
            let existing = await WorkoutScheduler.shared.scheduledWorkouts
            for item in existing where item.plan.id == plan.id {
                await WorkoutScheduler.shared.remove(item.plan, at: item.date)
            }
            // Note: schedule(_:at:) is `async` but non-throwing, so success is
            // confirmed by reading the schedule back rather than by a caught error.
            await WorkoutScheduler.shared.schedule(plan, at: comps)
            let after = await WorkoutScheduler.shared.scheduledWorkouts
            let ok = after.contains { $0.plan.id == plan.id }
            call.resolve([
                "scheduled": ok,
                "planId": plan.id.uuidString.lowercased(),
            ])
        }
        #else
        call.reject("WorkoutKit not available in this build.")
        #endif
    }

    // MARK: - Helpers

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static func double(_ v: Any?) -> Double? {
        if let d = v as? Double { return d }
        if let i = v as? Int { return Double(i) }
        if let n = v as? NSNumber { return n.doubleValue }
        return nil
    }

    #if canImport(WorkoutKit)
    /// A plain WorkoutStep (warmup / cooldown slots).
    @available(iOS 17.0, *)
    private static func makeStep(_ dict: [String: Any]?,
                                 activity: HKWorkoutActivityType,
                                 location: HKWorkoutSessionLocationType) -> WorkoutStep? {
        guard let dict, let seconds = double(dict["durationSeconds"]), seconds > 0 else { return nil }
        let alert = makeAlert(dict["alert"] as? [String: Any], activity: activity, location: location)
        var step = WorkoutStep(goal: .time(seconds, .seconds), alert: alert)
        if #available(iOS 18.0, *) {
            let label = (dict["label"] as? String) ?? ""
            if !label.isEmpty { step.displayName = label }
        }
        return step
    }

    /// An IntervalStep carrying its work/recovery purpose.
    @available(iOS 17.0, *)
    private static func makeIntervalStep(_ dict: [String: Any],
                                         activity: HKWorkoutActivityType,
                                         location: HKWorkoutSessionLocationType) -> IntervalStep? {
        guard let seconds = double(dict["durationSeconds"]), seconds > 0 else { return nil }
        let purposeStr = (dict["purpose"] as? String) ?? ((dict["kind"] as? String) ?? "work")
        let purpose: IntervalStep.Purpose =
            (purposeStr == "recovery" || purposeStr == "rest") ? .recovery : .work
        let alert = makeAlert(dict["alert"] as? [String: Any], activity: activity, location: location)
        var step = IntervalStep(purpose, goal: .time(seconds, .seconds), alert: alert)
        if #available(iOS 18.0, *) {
            let label = (dict["label"] as? String) ?? ""
            if !label.isEmpty { step.step.displayName = label }
        }
        return step
    }

    /// Build an alert, dropping it when WorkoutKit does not support that metric
    /// for this activity+location (e.g. power on an activity with no power source).
    @available(iOS 17.0, *)
    private static func makeAlert(_ a: [String: Any]?,
                                  activity: HKWorkoutActivityType,
                                  location: HKWorkoutSessionLocationType) -> (any WorkoutAlert)? {
        guard let a,
              let metric = a["metric"] as? String,
              let low = double(a["low"]),
              let high = double(a["high"]),
              low > 0, high >= low else { return nil }
        let alert: (any WorkoutAlert)?
        switch metric {
        // All four range factories take ClosedRange<Double> — passing Int ranges
        // does not compile.
        case "power":     alert = .power(low...high, unit: .watts)
        case "heartRate": alert = .heartRate(low...high)
        case "speed":     alert = .speed(low...high, unit: .metersPerSecond)
        case "cadence":   alert = .cadence(low...high)
        default:          alert = nil
        }
        guard let alert else { return nil }
        // Ask the framework rather than hardcoding a support matrix — support is
        // a function of (alert × activity × indoor/outdoor) and varies by OS.
        guard CustomWorkout.supportsAlert(alert, activity: activity, location: location) else { return nil }
        return alert
    }
    #endif

    private static func activityType(from s: String) -> HKWorkoutActivityType {
        switch s {
        case "cycling":                      return .cycling
        case "running":                      return .running
        case "walking":                      return .walking
        case "swimming":                     return .swimming
        case "rowing":                       return .rowing
        case "crossTraining":                return .crossTraining
        case "traditionalStrengthTraining":  return .traditionalStrengthTraining
        default:                             return .other
        }
    }
}
