// AppState.swift
// LaChartWatch
//
// Central state machine for the watch app.
// All screen transitions live here.

import Foundation
import Combine
import SwiftUI

@MainActor
final class AppState: ObservableObject {

    // MARK: - Screen
    @Published var screen: AppScreen = .face

    // MARK: - Workout selection
    @Published var selectedWorkout: WorkoutType? = nil

    // MARK: - Sensor connection status
    @Published var connected: [String: Bool] = [
        "stryd": false,
        "core":  false,
        "hr":    false
    ]

    // MARK: - Live metrics aggregated from HK + BLE
    @Published var live = LiveMetrics()

    // MARK: - Timer
    @Published var elapsed: TimeInterval = 0
    @Published var paused:  Bool = false

    // MARK: - Toast overlay
    @Published var toast: String? = nil

    // MARK: - Zone basis preference
    @Published var zoneBasis: ZoneBasis = .hr

    // MARK: - Summary (set when workout ends)
    @Published var summary: WorkoutSummary? = nil

    // MARK: - Managers
    let workoutManager = WorkoutManager()
    let bleManager     = BLEManager()
    let connectManager = WatchConnectivityManager.shared

    // MARK: - Private
    private var timerTask:       Task<Void, Never>? = nil
    private var countdownTask:   Task<Void, Never>? = nil
    private var bleObservers:    Set<AnyCancellable> = []
    private var hkObservers:     Set<AnyCancellable> = []

    // MARK: - Init

    init() {
        bindBLE()
        bindHealthKit()
        loadZoneBasis()
    }

    // MARK: - Navigation helpers

    func go(_ screen: AppScreen) {
        withAnimation(.easeInOut(duration: 0.25)) {
            self.screen = screen
        }
    }

    // MARK: - Workout flow

    func beginWorkout() {
        guard let wt = selectedWorkout else { return }
        // Start countdown
        screen = .countdown(3)
        countdownTask = Task {
            for i in stride(from: 3, through: 0, by: -1) {
                await MainActor.run {
                    self.screen = .countdown(i)
                }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
            await MainActor.run {
                self.screen = .run
            }
            await self.workoutManager.startWorkout(type: wt)
            self.startTimer()
        }
    }

    func pauseWorkout() {
        workoutManager.pauseWorkout()
        paused = true
        timerTask?.cancel()
        screen = .pause
    }

    func resumeWorkout() {
        workoutManager.resumeWorkout()
        paused = false
        startTimer()
        screen = .run
    }

    func markLap() {
        workoutManager.markLap()
        live.lap += 1
        // Append a running lap entry with current data
        let lapEntry = LapData(
            number: live.lap,
            pace:   live.pace,
            time:   live.elapsed,
            zoneId: live.zone
        )
        live.lapHistory.append(lapEntry)
        showToast("Lap \(live.lap)")
    }

    func endWorkout() async {
        timerTask?.cancel()
        paused = false
        elapsed = 0

        let s = await workoutManager.endWorkout()
        summary = s

        if let sum = s {
            await connectManager.sendWorkoutSummary(sum)
        }

        screen = .summary
    }

    func saveSummary() {
        screen = .saved
        // After 1.7 s auto-return to watch face
        Task {
            try? await Task.sleep(nanoseconds: 1_700_000_000)
            await MainActor.run {
                self.screen = .face
                self.resetLive()
            }
        }
    }

    func lockScreen() {
        screen = .lock
    }

    func unlockScreen() {
        screen = .pause
    }

    // MARK: - Timer

    private func startTimer() {
        timerTask?.cancel()
        timerTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled else { break }
                await MainActor.run {
                    self.elapsed += 1
                    self.live.elapsed = self.elapsed
                    self.syncBLEtoLive()
                    self.syncHKtoLive()
                    self.updateZone()
                }
            }
        }
    }

    // MARK: - Live sync

    private func syncBLEtoLive() {
        live.power        = bleManager.strydPower
        live.cadence      = bleManager.cadence
        live.groundContact = bleManager.groundContact
        live.vertOsc      = bleManager.vertOscillation
        live.legSpring    = bleManager.legSpring
        live.coreTemp     = bleManager.coreTemp
        live.skinTemp     = bleManager.skinTemp
        live.hsi          = bleManager.hsi

        // Prefer BLE HR if strap is connected
        if bleManager.hrConnected && bleManager.bleHR > 0 {
            live.hr = bleManager.bleHR
        }
    }

    private func syncHKtoLive() {
        live.distance  = workoutManager.distance
        live.calories  = workoutManager.calories
        live.pace      = workoutManager.pace

        // HR from HealthKit if no BLE strap
        if !bleManager.hrConnected {
            live.hr = workoutManager.hr
        }

        // Running average pace
        if elapsed > 0 && live.distance > 10 {
            live.avgPace = elapsed / (live.distance / 1000)
        }
    }

    private func updateZone() {
        let defaults = UserDefaults(suiteName: "group.com.lachart.app")
        let maxHR    = defaults?.integer(forKey: "maxHR") ?? 190

        switch zoneBasis {
        case .hr:
            let pct = maxHR > 0 ? Int(Double(live.hr) / Double(maxHR) * 100) : 50
            live.zone = TrainingZone.zone(forHRPercent: pct).id

        case .power:
            let ftp = defaults?.integer(forKey: "ftp") ?? 280
            live.zone = TrainingZone.zone(forPower: live.power, ftp: ftp).id

        case .pace, .lactate:
            // Use HR proxy as fallback when no direct lactate device
            let pct = maxHR > 0 ? Int(Double(live.hr) / Double(maxHR) * 100) : 50
            live.zone = TrainingZone.zone(forHRPercent: pct).id
        }
    }

    // MARK: - BLE bindings

    private func bindBLE() {
        bleManager.$strydConnected
            .receive(on: RunLoop.main)
            .sink { [weak self] v in self?.connected["stryd"] = v }
            .store(in: &bleObservers)

        bleManager.$coreConnected
            .receive(on: RunLoop.main)
            .sink { [weak self] v in self?.connected["core"] = v }
            .store(in: &bleObservers)

        bleManager.$hrConnected
            .receive(on: RunLoop.main)
            .sink { [weak self] v in self?.connected["hr"] = v }
            .store(in: &bleObservers)
    }

    private func bindHealthKit() {
        workoutManager.$hr
            .receive(on: RunLoop.main)
            .sink { [weak self] v in
                guard let self else { return }
                if !self.bleManager.hrConnected { self.live.hr = v }
            }
            .store(in: &hkObservers)
    }

    // MARK: - Helpers

    private func resetLive() {
        live = LiveMetrics()
        elapsed = 0
        paused  = false
        summary = nil
    }

    private func loadZoneBasis() {
        if let raw = UserDefaults.standard.string(forKey: "zoneBasis"),
           let zb  = ZoneBasis(rawValue: raw) {
            zoneBasis = zb
        }
    }

    func showToast(_ message: String) {
        toast = message
        Task {
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            await MainActor.run { self.toast = nil }
        }
    }

    var connectedSensorCount: Int {
        connected.values.filter { $0 }.count
    }
}
