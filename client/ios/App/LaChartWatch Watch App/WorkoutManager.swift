// WorkoutManager.swift
// LaChartWatch
//
// Wraps HealthKit HKWorkoutSession + HKLiveWorkoutBuilder.
// Publishes live metrics consumed by AppState.

import Foundation
import HealthKit
import Combine

@MainActor
final class WorkoutManager: NSObject, ObservableObject {

    // MARK: - Published state
    @Published var hr:       Int    = 0
    @Published var distance: Double = 0   // metres
    @Published var calories: Int    = 0
    @Published var pace:     TimeInterval = 0  // sec/km (derived from distance+elapsed)

    @Published var isRunning: Bool   = false
    @Published var isPaused:  Bool   = false
    @Published var error:     String? = nil

    // Accumulated elevation (gained)
    @Published var elevation: Double = 0

    // MARK: - Private
    private let store = HKHealthStore()
    private var session:  HKWorkoutSession?
    private var builder:  HKLiveWorkoutBuilder?
    private var workoutType: HKWorkoutActivityType = .running

    private var startDate: Date?
    private var lapStart:  Date?

    // Laps
    private(set) var laps: [LapData] = []
    private var lapIndex: Int = 0

    // HR samples for average
    private var hrSamples:      [(Date, Int)]     = []
    private var distanceSamples: [(Date, Double)] = []

    // MARK: - Authorization

    func requestAuthorisation() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }

        var types: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
        ]

        // Running power — watchOS 9+
        if #available(watchOS 9.0, *) {
            if let pwType = HKObjectType.quantityType(forIdentifier: .runningPower) {
                types.insert(pwType)
            }
            if let strideType = HKObjectType.quantityType(forIdentifier: .runningStrideLength) {
                types.insert(strideType)
            }
        }

        let writeTypes: Set<HKSampleType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
        ]

        do {
            try await store.requestAuthorization(toShare: writeTypes, read: types)
        } catch {
            self.error = "HealthKit auth error: \(error.localizedDescription)"
        }
    }

    // MARK: - Workout Lifecycle

    func startWorkout(type: WorkoutType) async {
        await requestAuthorisation()

        workoutType = type.hasGPS ? .running : .running // treadmill variant
        let hkType: HKWorkoutActivityType = type.id == "indoor" ? .running : .running
        let locType: HKWorkoutSessionLocationType = type.hasGPS ? .outdoor : .indoor

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = hkType
        configuration.locationType = locType

        do {
            let newSession = try HKWorkoutSession(healthStore: store, configuration: configuration)
            let newBuilder = newSession.associatedWorkoutBuilder()
            newBuilder.dataSource = HKLiveWorkoutDataSource(healthStore: store,
                                                             workoutConfiguration: configuration)
            newSession.delegate = self
            newBuilder.delegate = self

            self.session = newSession
            self.builder = newBuilder

            startDate = Date()
            lapStart  = startDate
            laps      = []
            lapIndex  = 0
            hrSamples = []
            distanceSamples = []
            elevation = 0

            newSession.startActivity(with: Date())
            try await newBuilder.beginCollection(at: Date())

            isRunning = true
            isPaused  = false
        } catch {
            self.error = "Could not start workout: \(error.localizedDescription)"
        }
    }

    func pauseWorkout() {
        session?.pause()
        isPaused = true
    }

    func resumeWorkout() {
        session?.resume()
        isPaused = false
    }

    func markLap() {
        guard let ls = lapStart else { return }
        let now     = Date()
        let lapTime = now.timeIntervalSince(ls)

        // Derive lap pace from distance delta (rough — use cumulative here)
        let lapPace: TimeInterval = lapTime > 0 && distance > 0
            ? (lapTime / (distance / 1000))
            : 0

        let zone = computeCurrentZone()
        lapIndex += 1
        laps.append(LapData(number: lapIndex, pace: lapPace, time: lapTime, zoneId: zone))
        lapStart = now
    }

    func endWorkout() async -> WorkoutSummary? {
        guard let session = session, let builder = builder,
              let start = startDate else { return nil }

        session.end()
        do {
            try await builder.endCollection(at: Date())
            let workout = try await builder.finishWorkout()
            let dur = Date().timeIntervalSince(start)

            // Zone distribution
            var zoneSeconds: [String: Double] = ["Z1":0,"Z2":0,"Z3":0,"Z4":0,"Z5":0]
            for lap in laps {
                let key = "Z\(lap.zoneId)"
                zoneSeconds[key, default: 0] += lap.time
            }
            let totalZ = zoneSeconds.values.reduce(0, +)
            var zoneFracs: [String: Double] = [:]
            for (k, v) in zoneSeconds {
                zoneFracs[k] = totalZ > 0 ? v / totalZ : 0
            }

            let avgHR = hrSamples.isEmpty ? 0
                : hrSamples.map(\.1).reduce(0, +) / hrSamples.count

            let avgPaceV: TimeInterval = distance > 10
                ? dur / (distance / 1000) : 0

            let summary = WorkoutSummary(
                title:            "Run \(DateFormatter.localizedString(from: start, dateStyle: .short, timeStyle: .none))",
                date:             start,
                distance:         distance,
                duration:         dur,
                avgPace:          avgPaceV,
                avgHR:            avgHR,
                avgPower:         0,
                maxHR:            hrSamples.map(\.1).max() ?? 0,
                calories:         calories,
                elevation:        elevation,
                zoneDistribution: zoneFracs,
                laps:             laps.map { LapSummary(number: $0.number, pace: $0.pace, time: $0.time, zoneId: $0.zoneId) },
                lactateReadings:  [],
                aiInsight:        aiInsightText(distance: distance, avgHR: avgHR, dur: dur)
            )

            isRunning = false
            isPaused  = false
            return summary
        } catch {
            self.error = "Could not finish workout: \(error.localizedDescription)"
            return nil
        }
    }

    // MARK: - Helpers

    private func computeCurrentZone() -> Int {
        // Prefer LT-based if thresholds are available in shared App Group
        let defaults = UserDefaults(suiteName: "group.com.lachart.app")
        let lt1 = defaults?.double(forKey: "lt1") ?? 0
        let lt2 = defaults?.double(forKey: "lt2") ?? 0

        // If no lactate thresholds, fall back to HR zones
        let maxHR = defaults?.integer(forKey: "maxHR") ?? 190
        guard maxHR > 0 else { return 1 }
        let pct = Int(Double(hr) / Double(maxHR) * 100)

        if lt1 > 0 && lt2 > 0 {
            // Use HR-based proxy for zone: LT1 ≈ 75%, LT2 ≈ 87%
            let lt1HR = Int(Double(maxHR) * 0.75)
            let lt2HR = Int(Double(maxHR) * 0.87)
            if hr < Int(Double(lt1HR) * 0.85) { return 1 }
            if hr < lt1HR                      { return 2 }
            if hr < lt2HR                      { return 3 }
            if hr < Int(Double(lt2HR) * 1.05)  { return 4 }
            return 5
        }

        return TrainingZone.zone(forHRPercent: pct).id
    }

    private func aiInsightText(distance: Double, avgHR: Int, dur: TimeInterval) -> String {
        let km = distance / 1000
        let mins = Int(dur / 60)
        return "Dobrý výkon! Uběhl/a jsi \(String(format: "%.2f", km)) km za \(mins) minut s průměrnou tepovou frekvencí \(avgHR) BPM. Zůstaň v Z2 pro optimální rozvoj aerobní kapacity."
    }
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession,
                                    didChangeTo toState: HKWorkoutSessionState,
                                    from fromState: HKWorkoutSessionState,
                                    date: Date) {
        // State handled via published properties
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession,
                                    didFailWithError error: Error) {
        Task { @MainActor in
            self.error = error.localizedDescription
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                                    didCollectDataOf collectedTypes: Set<HKSampleType>) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            for type in collectedTypes {
                guard let qType = type as? HKQuantityType else { continue }
                let stats = workoutBuilder.statistics(for: qType)

                switch qType.identifier {
                case HKQuantityTypeIdentifier.heartRate.rawValue:
                    let bpm = stats?.mostRecentQuantity()?.doubleValue(for: .count().unitDivided(by: .minute())) ?? 0
                    self.hr = Int(bpm)
                    self.hrSamples.append((Date(), self.hr))

                case HKQuantityTypeIdentifier.distanceWalkingRunning.rawValue:
                    let m = stats?.sumQuantity()?.doubleValue(for: .meter()) ?? 0
                    let prev = self.distance
                    self.distance = m
                    // Very rough elevation proxy (none from builder, use BLE or altimeter separately)
                    _ = prev

                case HKQuantityTypeIdentifier.activeEnergyBurned.rawValue:
                    let kcal = stats?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
                    self.calories = Int(kcal)

                default: break
                }
            }

            // Derive pace from elapsed + distance
            if let start = self.startDate, self.distance > 10 {
                let elapsed = Date().timeIntervalSince(start)
                self.pace = elapsed / (self.distance / 1000)
            }
        }
    }
}
