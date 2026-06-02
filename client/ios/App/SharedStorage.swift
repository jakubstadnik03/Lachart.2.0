//
//  SharedStorage.swift
//  LaChartWidget
//
//  Reads the cache the React/Capacitor app writes via the LaChartShared
//  Capacitor plugin. App Group `group.com.lachart.app` must be enabled
//  on BOTH the main app target and the widget extension target — without
//  it the suite() call returns nil and the widget shows placeholder data.
//

import Foundation

/// What today's training looks like at a glance. All workout fields are
/// optional — if today is a rest day the React side writes nil for them
/// and the widget renders the "Rest day" empty state.
struct FormFitnessSnapshot: Codable {
    let fitness: Int
    let fatigue: Int
    let form: Int
    let formDelta: Int       // delta vs yesterday
    let lastUpdated: Date

    // Today's planned workout (optional)
    let workoutTitle: String?      // "Tempo Run", "5×10min @ LT2", …
    let workoutSport: String?      // "bike" | "run" | "swim" | "strength" | "other"
    let workoutDurationSec: Int?   // seconds — drives the "0:17:09" line
    let workoutCategory: String?   // category id ("threshold", "endurance", …)
    let workoutSubtitle: String?   // optional secondary line ("1/5 Sets · 1/2 Exercises")

    // 14-day TSB sparkline for the medium widget
    let sparkline: [Int]

    static let placeholder = FormFitnessSnapshot(
        fitness: 57,
        fatigue: 38,
        form: -5,
        formDelta: 2,
        lastUpdated: Date(),
        workoutTitle: "Tempo Run",
        workoutSport: "run",
        workoutDurationSec: 3600,
        workoutCategory: "tempo",
        workoutSubtitle: "10 km · 4:45/km",
        sparkline: [-4, -2, 0, 1, 3, 5, 4, 2, 0, -1, 1, 4, 6, 7]
    )

    static let placeholderRestDay = FormFitnessSnapshot(
        fitness: 57, fatigue: 38, form: -5, formDelta: 2,
        lastUpdated: Date(),
        workoutTitle: nil, workoutSport: nil,
        workoutDurationSec: nil, workoutCategory: nil, workoutSubtitle: nil,
        sparkline: [-4, -2, 0, 1, 3, 5, 4, 2, 0, -1, 1, 4, 6, 7]
    )
}

enum SharedStorage {
    /// App Group identifier — must match the entitlement on BOTH targets.
    static let appGroupId = "group.com.lachart.app"

    /// Key used by the JS side (see `client/src/utils/widgetCache.js`).
    static let formFitnessKey = "lachart_form_fitness_cache_v1"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    static func loadFormFitness() -> FormFitnessSnapshot? {
        guard let data = defaults?.data(forKey: formFitnessKey) else { return nil }
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(FormFitnessSnapshot.self, from: data)
        } catch {
            return nil
        }
    }
}
