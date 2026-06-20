//
//  LaChartHealthPlugin.swift
//  App
//
//  Native HealthKit bridge for Capacitor 6. The @capgo/capacitor-health v8 pod
//  does not reliably register on Capacitor 6 (JS falls back to web → Unavailable).
//  This in-app plugin uses the same CAPBridgedPlugin pattern as LaChartShared.
//
//  JS: client/src/services/appleHealthCapacitor.js
//

import Foundation
import Capacitor
import HealthKit

@objc(LaChartHealthPlugin)
public class LaChartHealthPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "LaChartHealthPlugin"
    public let jsName = "LaChartHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPluginVersion", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryAggregated", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSamples", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryWorkouts", returnType: CAPPluginReturnPromise),
    ]

    /// Wellness + workouts — always requested so they appear under Health → Apps → LaChart.
    private let requiredReadIds = [
        "restingHeartRate", "sleep", "heartRateVariability",
        "respiratoryRate", "workouts", "heartRate",
    ]

    private let store = HKHealthStore()
    private lazy var isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    // MARK: - Availability

    @objc func isAvailable(_ call: CAPPluginCall) {
        let available = HKHealthStore.isHealthDataAvailable()
        if available {
            call.resolve(["available": true, "platform": "ios"])
        } else {
            call.resolve([
                "available": false,
                "platform": "ios",
                "reason": "Health data is not available on this device.",
            ])
        }
    }

    @objc func getPluginVersion(_ call: CAPPluginCall) {
        call.resolve(["version": "1.0.0-lachart"])
    }

    // MARK: - Authorization

    private func objectType(for id: String) -> HKObjectType? {
        switch id {
        case "restingHeartRate":
            return HKObjectType.quantityType(forIdentifier: .restingHeartRate)
        case "heartRate":
            return HKObjectType.quantityType(forIdentifier: .heartRate)
        case "heartRateVariability":
            return HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)
        case "respiratoryRate":
            return HKObjectType.quantityType(forIdentifier: .respiratoryRate)
        case "sleep":
            return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        case "workouts":
            return HKObjectType.workoutType()
        default:
            return nil
        }
    }

    private func readIdsFromCall(_ call: CAPPluginCall) -> [String] {
        if let typed = call.getArray("read", String.self), !typed.isEmpty {
            return typed
        }
        if let raw = call.getArray("read") as? [String], !raw.isEmpty {
            return raw
        }
        if let opts = call.options["read"] as? [String], !opts.isEmpty {
            return opts
        }
        return requiredReadIds
    }

    private func authStatusLabel(_ status: HKAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: return "notDetermined"
        case .sharingDenied: return "denied"
        case .sharingAuthorized: return "authorized"
        @unknown default: return "unknown"
        }
    }

    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["types": []])
            return
        }
        var rows: [[String: Any]] = []
        for id in requiredReadIds {
            guard let t = objectType(for: id) else { continue }
            rows.append([
                "id": id,
                "status": authStatusLabel(store.authorizationStatus(for: t)),
            ])
        }
        call.resolve(["types": rows])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device.")
            return
        }

        let readIds = readIdsFromCall(call)
        var readTypes = Set<HKObjectType>()
        var mergedIds = Set(requiredReadIds)
        readIds.forEach { mergedIds.insert($0) }

        for id in mergedIds {
            if let t = objectType(for: id) {
                readTypes.insert(t)
            }
        }

        if readTypes.isEmpty {
            call.reject("No readable HealthKit types configured.")
            return
        }

        var resolved = false
        let timeout = DispatchWorkItem { [weak call] in
            guard let call = call, !resolved else { return }
            resolved = true
            call.resolve([
                "readAuthorized": Array(mergedIds),
                "readDenied": [] as [String],
                "writeAuthorized": [] as [String],
                "writeDenied": [] as [String],
                "success": false,
                "timedOut": true,
            ])
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: timeout)

            self.store.requestAuthorization(toShare: [], read: readTypes) { success, error in
                DispatchQueue.main.async {
                    timeout.cancel()
                    guard !resolved else { return }
                    resolved = true
                    if let error = error {
                        call.reject(error.localizedDescription, nil, error)
                        return
                    }
                    call.resolve([
                        "readAuthorized": Array(mergedIds),
                        "readDenied": [] as [String],
                        "writeAuthorized": [] as [String],
                        "writeDenied": [] as [String],
                        "success": success,
                    ])
                }
            }
        }
    }

    // MARK: - Aggregated queries (RHR, heart rate)

    @objc func queryAggregated(_ call: CAPPluginCall) {
        guard let dataType = call.getString("dataType") else {
            call.reject("dataType is required")
            return
        }

        if dataType == "sleep" {
            aggregateSleep(call)
            return
        }
        if dataType == "heartRateVariability" {
            aggregateHRV(call)
            return
        }

        guard let quantityId = quantityIdentifier(for: dataType),
              let quantityType = HKObjectType.quantityType(forIdentifier: quantityId) else {
            call.reject("Unsupported data type: \(dataType)")
            return
        }

        let startDate = parseDate(call.getString("startDate"), default: Date().addingTimeInterval(-14 * 86400))
        let endDate = parseDate(call.getString("endDate"), default: Date())
        let aggregation = call.getString("aggregation") ?? "average"

        var options: HKStatisticsOptions = aggregation == "sum" ? .cumulativeSum : .discreteAverage
        if aggregation == "min" { options = .discreteMin }
        if aggregation == "max" { options = .discreteMax }

        var anchor = Calendar.current.dateComponents([.year, .month, .day], from: startDate)
        anchor.hour = 0
        let anchorDate = Calendar.current.date(from: anchor) ?? startDate
        let interval = DateComponents(day: 1)
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)

        let query = HKStatisticsCollectionQuery(
            quantityType: quantityType,
            quantitySamplePredicate: predicate,
            options: options,
            anchorDate: anchorDate,
            intervalComponents: interval
        )

        query.initialResultsHandler = { [weak self] _, collection, error in
            guard let self = self else { return }
            DispatchQueue.main.async {
                if let error = error {
                    call.reject(error.localizedDescription, nil, error)
                    return
                }
                guard let collection = collection else {
                    call.resolve(["samples": []])
                    return
                }

                var samples: [[String: Any]] = []
                let unit = self.preferredUnit(for: dataType)
                collection.enumerateStatistics(from: startDate, to: endDate) { stats, _ in
                    guard let qty = stats.averageQuantity() ?? stats.sumQuantity() else { return }
                    let value = qty.doubleValue(for: unit)
                    guard value > 0 else { return }
                    let startIso = self.isoFormatter.string(from: stats.startDate)
                    samples.append([
                        "dataType": dataType,
                        "value": value,
                        "unit": unit.unitString,
                        "startDate": startIso,
                        "endDate": self.isoFormatter.string(from: stats.endDate),
                    ])
                }
                call.resolve(["samples": samples])
            }
        }
        store.execute(query)
    }

    // MARK: - Raw samples (fallback)

    @objc func readSamples(_ call: CAPPluginCall) {
        guard let dataType = call.getString("dataType") else {
            call.reject("dataType is required")
            return
        }

        let startDate = parseDate(call.getString("startDate"), default: Date().addingTimeInterval(-14 * 86400))
        let endDate = parseDate(call.getString("endDate"), default: Date())
        let limit = call.getInt("limit") ?? 500
        let ascending = call.getBool("ascending") ?? false
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [])

        if dataType == "sleep", let sampleType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            let query = HKSampleQuery(sampleType: sampleType, predicate: predicate, limit: limit, sortDescriptors: [
                NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: ascending),
            ]) { [weak self] _, samples, error in
                guard let self = self else { return }
                DispatchQueue.main.async {
                    if let error = error { call.reject(error.localizedDescription, nil, error); return }
                    let rows = (samples as? [HKCategorySample] ?? []).compactMap { s -> [String: Any]? in
                        let mins = s.endDate.timeIntervalSince(s.startDate) / 60.0
                        guard mins > 0 else { return nil }
                        return [
                            "dataType": "sleep",
                            "value": mins,
                            "unit": "minute",
                            "startDate": self.isoFormatter.string(from: s.startDate),
                            "endDate": self.isoFormatter.string(from: s.endDate),
                        ]
                    }
                    call.resolve(["samples": rows])
                }
            }
            store.execute(query)
            return
        }

        guard let quantityId = quantityIdentifier(for: dataType),
              let sampleType = HKObjectType.quantityType(forIdentifier: quantityId) else {
            call.reject("Unsupported data type: \(dataType)")
            return
        }

        let query = HKSampleQuery(sampleType: sampleType, predicate: predicate, limit: limit, sortDescriptors: [
            NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: ascending),
        ]) { [weak self] _, samples, error in
            guard let self = self else { return }
            DispatchQueue.main.async {
                if let error = error { call.reject(error.localizedDescription, nil, error); return }
                let unit = self.preferredUnit(for: dataType)
                let rows = (samples as? [HKQuantitySample] ?? []).map { s -> [String: Any] in
                    [
                        "dataType": dataType,
                        "value": s.quantity.doubleValue(for: unit),
                        "unit": unit.unitString,
                        "startDate": self.isoFormatter.string(from: s.startDate),
                        "endDate": self.isoFormatter.string(from: s.endDate),
                    ]
                }
                call.resolve(["samples": rows])
            }
        }
        store.execute(query)
    }

    // MARK: - Workouts

    @objc func queryWorkouts(_ call: CAPPluginCall) {
        let startDate = parseDate(call.getString("startDate"), default: Date().addingTimeInterval(-90 * 86400))
        let endDate = parseDate(call.getString("endDate"), default: Date())
        let limit = call.getInt("limit") ?? 300
        let ascending = call.getBool("ascending") ?? false
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: ascending)

        let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: limit, sortDescriptors: [sort]) { [weak self] _, samples, error in
            guard let self = self else { return }
            DispatchQueue.main.async {
                if let error = error { call.reject(error.localizedDescription, nil, error); return }
                let workouts = (samples as? [HKWorkout] ?? []).map { self.workoutPayload($0) }
                call.resolve(["workouts": workouts])
            }
        }
        store.execute(query)
    }

    // MARK: - Helpers

    private func quantityIdentifier(for dataType: String) -> HKQuantityTypeIdentifier? {
        switch dataType {
        case "restingHeartRate": return .restingHeartRate
        case "heartRate": return .heartRate
        case "heartRateVariability": return .heartRateVariabilitySDNN
        case "respiratoryRate": return .respiratoryRate
        default: return nil
        }
    }

    private func preferredUnit(for dataType: String) -> HKUnit {
        switch dataType {
        case "heartRateVariability":
            return HKUnit.secondUnit(with: .milli)
        case "restingHeartRate", "heartRate", "respiratoryRate":
            return HKUnit.count().unitDivided(by: .minute())
        default:
            return HKUnit.count().unitDivided(by: .minute())
        }
    }

    private func parseDate(_ raw: String?, default defaultDate: Date) -> Date {
        guard let raw = raw, !raw.isEmpty else { return defaultDate }
        if let d = isoFormatter.date(from: raw) { return d }
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        return fallback.date(from: raw) ?? defaultDate
    }

    private func aggregateSleep(_ call: CAPPluginCall) {
        let startDate = parseDate(call.getString("startDate"), default: Date().addingTimeInterval(-14 * 86400))
        let endDate = parseDate(call.getString("endDate"), default: Date())
        guard let sampleType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            call.reject("Sleep type unavailable")
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [])
        let query = HKSampleQuery(sampleType: sampleType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { [weak self] _, samples, error in
            guard let self = self else { return }
            DispatchQueue.main.async {
                if let error = error { call.reject(error.localizedDescription, nil, error); return }
                var byDay: [String: Double] = [:]
                let cal = Calendar.current
                let dayFmt = DateFormatter()
                dayFmt.dateFormat = "yyyy-MM-dd"
                dayFmt.timeZone = TimeZone.current
                for s in (samples as? [HKCategorySample] ?? []) {
                    if s.value == HKCategoryValueSleepAnalysis.inBed.rawValue { continue }
                    let day = cal.startOfDay(for: s.startDate)
                    let key = dayFmt.string(from: day)
                    let mins = s.endDate.timeIntervalSince(s.startDate) / 60.0
                    byDay[key] = (byDay[key] ?? 0) + mins
                }
                let rows = byDay.keys.sorted().map { day -> [String: Any] in
                    [
                        "dataType": "sleep",
                        "value": byDay[day] ?? 0,
                        "unit": "minute",
                        "startDate": "\(day)T00:00:00.000Z",
                        "endDate": "\(day)T23:59:59.000Z",
                    ]
                }
                call.resolve(["samples": rows])
            }
        }
        store.execute(query)
    }

    private func aggregateHRV(_ call: CAPPluginCall) {
        guard let sampleType = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) else {
            call.reject("HRV type unavailable")
            return
        }
        let startDate = parseDate(call.getString("startDate"), default: Date().addingTimeInterval(-14 * 86400))
        let endDate = parseDate(call.getString("endDate"), default: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [])
        let query = HKSampleQuery(sampleType: sampleType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { [weak self] _, samples, error in
            guard let self = self else { return }
            DispatchQueue.main.async {
                if let error = error { call.reject(error.localizedDescription, nil, error); return }
                var sums: [String: (total: Double, count: Int)] = [:]
                let cal = Calendar.current
                let dayFmt = DateFormatter()
                dayFmt.dateFormat = "yyyy-MM-dd"
                dayFmt.timeZone = TimeZone.current
                let unit = HKUnit.secondUnit(with: .milli)
                for s in (samples as? [HKQuantitySample] ?? []) {
                    let day = cal.startOfDay(for: s.startDate)
                    let key = dayFmt.string(from: day)
                    let v = s.quantity.doubleValue(for: unit)
                    guard v > 0 else { continue }
                    var bucket = sums[key] ?? (0, 0)
                    bucket.total += v
                    bucket.count += 1
                    sums[key] = bucket
                }
                let rows = sums.keys.sorted().map { day -> [String: Any] in
                    let b = sums[day]!
                    return [
                        "dataType": "heartRateVariability",
                        "value": b.total / Double(b.count),
                        "unit": "ms",
                        "startDate": "\(day)T00:00:00.000Z",
                        "endDate": "\(day)T23:59:59.000Z",
                    ]
                }
                call.resolve(["samples": rows])
            }
        }
        store.execute(query)
    }

    private func workoutPayload(_ w: HKWorkout) -> [String: Any] {
        var payload: [String: Any] = [
            "workoutType": workoutTypeName(w.workoutActivityType),
            "duration": Int(w.duration),
            "startDate": isoFormatter.string(from: w.startDate),
            "endDate": isoFormatter.string(from: w.endDate),
            "platformId": w.uuid.uuidString,
        ]
        if let dist = w.totalDistance {
            payload["totalDistance"] = dist.doubleValue(for: .meter())
        }
        if let energy = w.totalEnergyBurned {
            payload["totalEnergyBurned"] = energy.doubleValue(for: .kilocalorie())
        }
        if let meta = w.metadata?[HKMetadataKeyExternalUUID] as? String {
            payload["sourceName"] = meta
        }
        return payload
    }

    private func workoutTypeName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "running"
        case .cycling: return "cycling"
        case .swimming: return "swimming"
        case .walking: return "walking"
        case .hiking: return "hiking"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .stairClimbing: return "stairClimbing"
        case .crossTraining: return "crossTraining"
        default: return "other"
        }
    }
}
