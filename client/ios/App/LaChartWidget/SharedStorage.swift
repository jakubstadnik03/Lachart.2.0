//
//  SharedStorage.swift
//  LaChartWidget
//
//  Reads the cache the React/Capacitor app writes via the LaChartShared
//  Capacitor plugin. App Group `group.com.lachart.app` must be enabled
//  on BOTH the main app target and the widget extension target.
//

import Foundation

/// A single training entry — completed or planned — that the widget renders
/// in its lists. Sport drives the SF Symbol icon, category drives the dot tint.
struct WidgetWorkout: Codable, Identifiable {
    let title: String
    let sport: String?          // "bike" | "run" | "swim" | "strength" | "yoga"
    let durationSec: Int?
    let category: String?       // category id used for the colour dot
    let subtitle: String?       // optional "10 km · 4:45/km" line

    // Make SwiftUI's ForEach happy with non-unique titles
    var id: String { "\(title)-\(sport ?? "")-\(durationSec ?? 0)-\(subtitle ?? "")" }
}

struct FormFitnessSnapshot: Codable {
    let fitness: Int
    let fatigue: Int
    let form: Int
    let formDelta: Int
    let lastUpdated: Date

    let todayCompleted: [WidgetWorkout]
    let todayPlanned:   [WidgetWorkout]

    let sparkline: [Int]

    /// Synthetic placeholder shown when the App Group cache is empty — i.e.
    /// the user has installed the widget but hasn't opened the app yet (so
    /// JS hasn't had a chance to write). The view layer detects this via
    /// `isEmptyState` and renders a "Open LaChart to sync" hint instead of
    /// fake numbers, so the user doesn't think the widget is broken.
    static let empty = FormFitnessSnapshot(
        fitness: 0, fatigue: 0, form: 0, formDelta: 0,
        lastUpdated: Date(timeIntervalSince1970: 0),
        todayCompleted: [],
        todayPlanned: [],
        sparkline: []
    )

    /// For Xcode previews only — never used at runtime when the cache is empty.
    static let preview = FormFitnessSnapshot(
        fitness: 122,
        fatigue: 131,
        form: -3,
        formDelta: -4,
        lastUpdated: Date(),
        todayCompleted: [
            WidgetWorkout(title: "Easy", sport: "bike", durationSec: 7680, category: "endurance", subtitle: "53.8 km · 228 W")
        ],
        todayPlanned: [
            WidgetWorkout(title: "Tempo Run", sport: "run", durationSec: 3600, category: "tempo", subtitle: "10 km · 4:45/km")
        ],
        sparkline: []
    )

    var isEmptyState: Bool {
        lastUpdated.timeIntervalSince1970 == 0
    }
}

enum SharedStorage {
    static let appGroupId = "group.com.lachart.app"
    static let formFitnessKey = "lachart_form_fitness_cache_v1"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    static func loadFormFitness() -> FormFitnessSnapshot? {
        guard let data = defaults?.data(forKey: formFitnessKey) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(FormFitnessSnapshot.self, from: data)
    }
}
