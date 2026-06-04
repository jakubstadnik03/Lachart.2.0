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

    // ── Sensor sampling for sync ─────────────────────────────────────
    // While a workout is running we snapshot CORE + Stryd values every
    // ~5 s into these buffers. Anything denser would explode the WCSession
    // message size (which has a 65 KB practical limit) for runs longer
    // than ~20 minutes. The iPhone side resamples for charts.
    private var coreBuffer:  [CoreTempSample] = []
    private var strydBuffer: [StrydSample]    = []
    private var sampleTask:  Task<Void, Never>? = nil
    private var workoutStartedAt: Date? = nil
    private var hsiPeak: Double = 0

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

        // Window for this lap = [previous lap end → now]. We use it to
        // average BLE sensor samples that fell within the lap so the
        // training detail page can show per-lap heat / power / cadence
        // without re-deriving from the full time-series.
        let lapEndT   = Double(elapsed)
        let lapStartT = live.lapHistory.last.map { Double($0.cumulativeEnd) } ?? 0
        let coreInLap = coreBuffer.filter { $0.t >= lapStartT && $0.t <= lapEndT }
        let strydInLap = strydBuffer.filter { $0.t >= lapStartT && $0.t <= lapEndT }

        func avg<T: BinaryFloatingPoint>(_ vs: [T]) -> Double {
            vs.isEmpty ? 0 : Double(vs.reduce(0, +)) / Double(vs.count)
        }
        func avgInt(_ vs: [Int]) -> Int {
            vs.isEmpty ? 0 : Int((vs.reduce(0, +)) / vs.count)
        }

        var lapEntry = LapData(
            number: live.lap,
            pace:   live.pace,
            time:   lapEndT - lapStartT,
            zoneId: live.zone
        )
        lapEntry.cumulativeEnd = lapEndT
        lapEntry.avgHR        = live.hr
        lapEntry.avgPower     = avgInt(strydInLap.map { $0.power })
        lapEntry.avgCadence   = avgInt(strydInLap.map { $0.cadence })
        lapEntry.avgCoreTemp  = avg(coreInLap.map { $0.core })
        lapEntry.peakHSI      = coreInLap.map { $0.hsi }.max() ?? 0
        // distance for this lap = total distance - sum of previous laps
        let priorDistance = live.lapHistory.reduce(0.0) { $0 + $1.distance }
        lapEntry.distance     = max(0, live.distance - priorDistance)

        live.lapHistory.append(lapEntry)
        showToast("Lap \(live.lap)")
    }

    func endWorkout() async {
        timerTask?.cancel()
        sampleTask?.cancel()
        paused = false
        elapsed = 0

        // Capture one final snapshot at the moment the workout ends so the
        // tail of the run isn't missing CORE / Stryd values.
        captureSensorSnapshot()

        let baseSummary = await workoutManager.endWorkout()

        // Splice the captured sensor buffers + idempotency id + the
        // user-marked laps (live.lapHistory) onto the summary that
        // WorkoutManager produced. We prefer `live.lapHistory` over
        // `base.laps` because:
        //   • lapHistory entries carry per-lap sensor averages (CORE,
        //     Stryd power, cadence, peak HSI, lap distance) computed
        //     by markLap() — WorkoutManager only sees pace + zone.
        //   • lapHistory honours the user's double-tap markers; the
        //     base laps are HK's auto-splits which may not match.
        // If the user never tapped a lap, fall back to WorkoutManager's
        // auto-laps so the summary always has at least the rough split.
        let mappedLaps: [LapSummary] = {
            if !live.lapHistory.isEmpty {
                return live.lapHistory.map { lap in
                    LapSummary(
                        number:      lap.number,
                        pace:        lap.pace,
                        time:        lap.time,
                        zoneId:      lap.zoneId,
                        avgHR:       lap.avgHR,
                        avgPower:    lap.avgPower,
                        avgCadence:  lap.avgCadence,
                        avgCoreTemp: lap.avgCoreTemp,
                        peakHSI:     lap.peakHSI,
                        distance:    lap.distance
                    )
                }
            }
            return baseSummary?.laps ?? []
        }()

        let enriched: WorkoutSummary? = baseSummary.map { base in
            WorkoutSummary(
                title:            base.title,
                sport:            base.sport,
                date:             base.date,
                distance:         base.distance,
                duration:         base.duration,
                avgPace:          base.avgPace,
                avgHR:            base.avgHR,
                avgPower:         base.avgPower,
                maxHR:            base.maxHR,
                calories:         base.calories,
                elevation:        base.elevation,
                zoneDistribution: base.zoneDistribution,
                laps:             mappedLaps,
                lactateReadings:  base.lactateReadings,
                aiInsight:        base.aiInsight,
                watchActivityId:  watchActivityId(for: workoutStartedAt ?? Date()),
                coreTempSeries:   coreBuffer,
                strydSeries:      strydBuffer,
                hsiPeak:          hsiPeak
            )
        }
        summary = enriched

        if let sum = enriched {
            await connectManager.sendWorkoutSummary(sum)
        }

        // Reset buffers so the next session starts clean.
        workoutStartedAt = nil
        coreBuffer.removeAll(keepingCapacity: true)
        strydBuffer.removeAll(keepingCapacity: true)
        hsiPeak = 0

        screen = .summary
    }

    /// Deterministic id derived from the workout start time. Stable across
    /// WCSession retries, so the iPhone-side upsert collapses dupes.
    private func watchActivityId(for start: Date) -> String {
        "watch-\(Int(start.timeIntervalSince1970))"
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
        // Begin BLE sampling alongside the elapsed timer. Stored start
        // time anchors every sample's `t` (seconds since workout begin).
        workoutStartedAt = Date()
        coreBuffer.removeAll(keepingCapacity: true)
        strydBuffer.removeAll(keepingCapacity: true)
        hsiPeak = 0
        startSensorSampling()
    }

    /// Push a CORE + Stryd snapshot into the sync buffers every 5 s while
    /// the workout is running. Cancelled on pause/end so we don't sample
    /// stale BLE values.
    private func startSensorSampling() {
        sampleTask?.cancel()
        sampleTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                guard !Task.isCancelled else { break }
                await MainActor.run { self.captureSensorSnapshot() }
            }
        }
    }

    private func captureSensorSnapshot() {
        guard let started = workoutStartedAt else { return }
        let t = Date().timeIntervalSince(started)

        if bleManager.coreTemp > 0 {
            coreBuffer.append(CoreTempSample(
                t: t,
                core: bleManager.coreTemp,
                skin: bleManager.skinTemp,
                hsi:  bleManager.hsi
            ))
            if bleManager.hsi > hsiPeak { hsiPeak = bleManager.hsi }
        }
        if bleManager.strydPower > 0 {
            strydBuffer.append(StrydSample(
                t:       t,
                power:   bleManager.strydPower,
                cadence: bleManager.cadence,
                gct:     bleManager.groundContact,
                vosc:    bleManager.vertOscillation,
                lss:     bleManager.legSpring
            ))
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

        // Live previews so the Senzory screen shows values before a workout starts
        // (during a workout syncBLEtoLive() refreshes these every tick as well).
        bleManager.$strydPower
            .receive(on: RunLoop.main)
            .sink { [weak self] v in self?.live.power = v }
            .store(in: &bleObservers)

        bleManager.$coreTemp
            .receive(on: RunLoop.main)
            .sink { [weak self] v in self?.live.coreTemp = v }
            .store(in: &bleObservers)

        bleManager.$bleHR
            .receive(on: RunLoop.main)
            .sink { [weak self] v in
                guard let self else { return }
                if self.bleManager.hrConnected { self.live.hr = v }
            }
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
