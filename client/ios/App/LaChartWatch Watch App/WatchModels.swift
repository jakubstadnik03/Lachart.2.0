// WatchModels.swift
// LaChartWatch
//
// Data models shared across the watch app.

import Foundation
import SwiftUI

// MARK: - App Screen Enum

enum AppScreen: Equatable {
    case face
    case select
    case sensors
    case ready
    case countdown(Int)   // remaining seconds: 3, 2, 1, 0 = "GO!"
    case run
    case pause
    case lock
    case summary
    case saved
}

// MARK: - Workout Type

struct WorkoutType: Identifiable, Equatable {
    let id:           String
    let name:         String
    let sub:          String
    let icon:         String   // SF Symbol name
    let hasGPS:       Bool
    let isStructured: Bool

    static let all: [WorkoutType] = [
        WorkoutType(id: "outdoor",    name: "Outdoor Run",  sub: "GPS · Outdoor",      icon: "figure.run",          hasGPS: true,  isStructured: false),
        WorkoutType(id: "indoor",     name: "Indoor Run",   sub: "Treadmill",      icon: "figure.run.treadmill", hasGPS: false, isStructured: false),
        WorkoutType(id: "track",      name: "Track Run",    sub: "Track",  icon: "oval",                hasGPS: true,  isStructured: false),
        WorkoutType(id: "intervals",  name: "Intervals",    sub: "Structured",    icon: "waveform.path",       hasGPS: true,  isStructured: true),
    ]
}

// MARK: - Sensor Device

struct SensorDevice: Identifiable {
    let id:          String
    var name:        String
    var sub:         String
    var icon:        String   // SF Symbol name
    var isConnected: Bool
    var battery:     Int?     // 0–100 %
    var liveValue:   String?  // e.g. "247 W"
}

// MARK: - Structured Workout Step

enum StepKind: String {
    case warmup, work, rest, cooldown
}

struct StructuredStep: Identifiable {
    let id:       UUID = UUID()
    let kind:     StepKind
    let label:    String
    let target:   String      // e.g. "4:20 /km" or "280 W"
    let duration: TimeInterval
    let zone:     Int         // 1–5
}

// MARK: - Lap Data

struct LapData: Identifiable {
    let id:     UUID = UUID()
    let number: Int
    let pace:   TimeInterval   // sec/km
    let time:   TimeInterval   // elapsed lap time seconds
    let zoneId: Int

    // Averages captured by AppState.markLap() over the BLE samples that
    // fell within this lap's time window. Zero when the matching sensor
    // wasn't paired during the lap.
    var avgHR:        Int    = 0
    var avgPower:     Int    = 0      // Stryd watts
    var avgCadence:   Int    = 0      // Stryd spm
    var avgCoreTemp:  Double = 0      // °C
    var peakHSI:      Double = 0
    var distance:     Double = 0      // metres (lap segment)

    /// Absolute time of the lap end (seconds since workout start).
    /// Used internally by AppState to window BLE samples for the next lap.
    var cumulativeEnd: TimeInterval = 0
}

// MARK: - Live Metrics

struct LiveMetrics {
    var elapsed:      TimeInterval = 0
    var hr:           Int          = 0
    var pace:         TimeInterval = 0    // sec/km
    var avgPace:      TimeInterval = 0    // sec/km
    var distance:     Double       = 0    // metres
    var power:        Int          = 0    // watts
    var cadence:      Int          = 0    // spm
    var coreTemp:     Double       = 0    // °C
    var skinTemp:     Double       = 0    // °C
    var hsi:          Double       = 0    // Heat Strain Index 0–10
    var elevation:    Double       = 0    // metres gained
    var calories:     Int          = 0
    var zone:         Int          = 1    // 1–5
    var lap:          Int          = 1
    var lapHistory:   [LapData]    = []
    var stepIndex:    Int          = 0    // for structured workouts
    var vertOsc:      Double       = 0    // cm
    var groundContact: Int         = 0    // ms
    var legSpring:    Double       = 0    // kN/m

    // Summary computed from history
    var zoneSeconds: [Int: TimeInterval] {
        var d: [Int: TimeInterval] = [1:0, 2:0, 3:0, 4:0, 5:0]
        for lap in lapHistory {
            d[lap.zoneId, default: 0] += lap.time
        }
        return d
    }
}

// MARK: - Workout Summary (sent to iPhone)

struct WorkoutSummary: Codable {
    let title:            String
    let sport:            String          // run | bike | swim | walk | strength | mtb | other
    let date:             Date
    let distance:         Double          // metres
    let duration:         TimeInterval
    let avgPace:          TimeInterval    // sec/km
    let avgHR:            Int
    let avgPower:         Int
    let maxHR:            Int
    let calories:         Int
    let elevation:        Double
    let zoneDistribution: [String: Double] // "Z1"…"Z5" → fraction 0–1
    let laps:             [LapSummary]
    let lactateReadings:  [LactateReading]
    let aiInsight:        String?

    /// Idempotency key — generated from session start timestamp so
    /// re-sending the same workout via WCSession produces the same id.
    let watchActivityId:  String

    /// BLE sensor time-series, sampled ~every 5 s during the workout.
    /// Empty arrays when the matching sensor isn't paired (e.g. user
    /// runs without CORE or without Stryd).
    let coreTempSeries:   [CoreTempSample]
    let strydSeries:      [StrydSample]
    let hsiPeak:          Double
}

struct CoreTempSample: Codable {
    let t:    TimeInterval   // seconds since workout start
    let core: Double         // °C
    let skin: Double         // °C
    let hsi:  Double         // Heat Strain Index 0..10
}

struct StrydSample: Codable {
    let t:       TimeInterval
    let power:   Int         // W
    let cadence: Int         // spm
    let gct:     Int         // ground contact (ms)
    let vosc:    Double      // vertical oscillation (cm)
    let lss:     Double      // leg spring stiffness (kN/m)
}

struct LapSummary: Codable {
    let number: Int
    let pace:   TimeInterval
    let time:   TimeInterval
    let zoneId: Int

    // Per-lap sensor averages — let the iPhone-side training detail
    // page show "lap 3 ran at 285 W avg / 178 spm / 37.4 °C core" without
    // needing to scrub the time-series. Zero when the sensor wasn't
    // paired during this lap.
    var avgHR:       Int    = 0
    var avgPower:    Int    = 0
    var avgCadence:  Int    = 0
    var avgCoreTemp: Double = 0
    var peakHSI:     Double = 0
    var distance:    Double = 0   // metres covered in this lap
}

struct LactateReading: Codable {
    let timestamp: Date
    let mmol:      Double
    let hr:        Int
    let pace:      TimeInterval
}

// MARK: - Helpers

extension TimeInterval {
    /// Format as mm:ss
    var mmss: String {
        let total = Int(self)
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    /// Format as sec/km → "/km" pace string  e.g. "4:32"
    var paceString: String {
        guard self > 0 else { return "--:--" }
        return mmss
    }
}
