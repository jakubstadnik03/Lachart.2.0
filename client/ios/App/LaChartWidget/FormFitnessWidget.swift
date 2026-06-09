//
//  FormFitnessWidget.swift
//  LaChartWidget
//
//  "Today's Training" widget — LaChart-themed.
//    • Small  — KPI row + 2 workout chips (completed + planned)
//    • Medium — KPI row + DONE / PLANNED sections
//
//  Colour scheme mirrors the in-app StatusHeroCard: purple primary,
//  green for completed, dashed muted for planned, red for overload state.
//

import WidgetKit
import SwiftUI

// MARK: - Timeline

struct FormFitnessEntry: TimelineEntry {
    let date: Date
    let snapshot: FormFitnessSnapshot
    let isStale: Bool
}

struct FormFitnessProvider: TimelineProvider {
    func placeholder(in context: Context) -> FormFitnessEntry {
        FormFitnessEntry(date: Date(), snapshot: .preview, isStale: false)
    }
    func getSnapshot(in context: Context, completion: @escaping (FormFitnessEntry) -> Void) {
        completion(makeEntry())
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<FormFitnessEntry>) -> Void) {
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [makeEntry()], policy: .after(next)))
    }
    private func makeEntry() -> FormFitnessEntry {
        if let snap = SharedStorage.loadFormFitness() {
            // 24-h stale = warn the user via a small chip; otherwise treat fresh.
            let stale = snap.lastUpdated.timeIntervalSince1970 > 0
                && Date().timeIntervalSince(snap.lastUpdated) > 86_400
            return FormFitnessEntry(date: Date(), snapshot: snap, isStale: stale)
        }
        return FormFitnessEntry(date: Date(), snapshot: .empty, isStale: false)
    }
}

// MARK: - Theme — match the in-app palette

enum LaChartColor {
    static let primary  = Color(red: 0.37, green: 0.40, blue: 0.71)  // #5E6590
    static let primaryLight = Color(red: 0.46, green: 0.49, blue: 0.71) // #767EB5
    static let ink      = Color(red: 0.04, green: 0.05, blue: 0.10)  // #0A0E1A
    static let muted    = Color(red: 0.61, green: 0.64, blue: 0.72)  // #9CA3AF
    static let mark     = Color(red: 0.37, green: 0.40, blue: 0.71)
    static let danger   = Color(red: 0.72, green: 0.26, blue: 0.22)  // #B84238
    static let warning  = Color(red: 0.96, green: 0.49, blue: 0.13)
    static let success  = Color(red: 0.13, green: 0.55, blue: 0.13)

    static func forForm(_ form: Int) -> Color {
        // Same buckets the StatusHeroCard ring uses.
        switch form {
        case ..<(-25): return danger
        case ..<(-10): return warning
        case 0...20:   return success
        default:       return primary
        }
    }

    static func forCategory(_ cat: String?) -> Color {
        switch (cat ?? "").lowercased() {
        case "recovery":         return Color(red: 0.38, green: 0.69, blue: 0.94)
        case "endurance":        return Color(red: 0.20, green: 0.83, blue: 0.60)
        case "tempo":            return Color(red: 0.55, green: 0.36, blue: 0.96)
        case "threshold", "lt2": return Color(red: 0.96, green: 0.49, blue: 0.13)
        case "vo2max", "vo2":    return Color(red: 0.94, green: 0.27, blue: 0.27)
        case "strength":         return Color(red: 0.55, green: 0.36, blue: 0.96)
        default:                 return primary
        }
    }
}

private func sportSymbol(_ sport: String?) -> String {
    switch (sport ?? "").lowercased() {
    case "bike", "ride", "cycle", "virtual": return "bicycle"
    case "swim":                              return "figure.pool.swim"
    case "strength", "gym", "weights":        return "dumbbell.fill"
    case "yoga":                              return "figure.yoga"
    default:                                  return "figure.run"
    }
}

// MARK: - KPI Row (matches StatusHeroCard layout)

struct KPIRow: View {
    let snapshot: FormFitnessSnapshot
    var compact: Bool = false
    var big: Bool = false   // medium/large widget — fill the width with larger numbers

    var body: some View {
        HStack(spacing: 0) {
            kpi(value: "\(snapshot.fitness)",
                label: "FITNESS",
                color: LaChartColor.primary)
            Spacer(minLength: 0)
            kpi(value: formattedForm(snapshot.form),
                label: "FORM",
                color: LaChartColor.forForm(snapshot.form))
            Spacer(minLength: 0)
            kpi(value: "\(snapshot.fatigue)",
                label: "FATIGUE",
                color: LaChartColor.danger)
        }
    }

    private var valueSize: CGFloat { big ? 32 : (compact ? 18 : 22) }
    private var labelSize: CGFloat { big ? 10 : (compact ? 7 : 8) }

    private func kpi(value: String, label: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: valueSize, weight: .bold))
                .foregroundColor(LaChartColor.ink)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(label)
                .font(.system(size: labelSize, weight: .heavy))
                .tracking(0.5)
                .foregroundColor(color)
        }
        .frame(maxWidth: .infinity)
    }

    private func formattedForm(_ v: Int) -> String { v >= 0 ? "+\(v)" : "\(v)" }
}

// MARK: - Workout row

private func formatDuration(_ s: Int?) -> String {
    guard let s = s, s > 0 else { return "" }
    let h = s / 3600, m = (s % 3600) / 60
    if h > 0 { return m > 0 ? "\(h)h \(m)m" : "\(h)h" }
    return "\(m)m"
}

struct WorkoutRow: View {
    let workout: WidgetWorkout
    let done: Bool       // true = completed (green check); false = planned (dashed)
    var compact: Bool = false
    var large: Bool = false  // medium widget — bigger, roomier rows

    var body: some View {
        // Completed → open the activity modal (open-training). Planned → open
        // the planned-workout editor (open-planned). Both deep-link by id.
        if let tid = workout.targetId, !tid.isEmpty,
           let encoded = tid.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
           let url = URL(string: "com.lachart.app://\(done ? "open-training" : "open-planned")?id=\(encoded)") {
            Link(destination: url) { rowContent }
        } else {
            rowContent
        }
    }

    private var circleD: CGFloat { large ? 34 : (compact ? 22 : 26) }
    private var iconSize: CGFloat { large ? 16 : (compact ? 11 : 13) }
    private var titleSize: CGFloat { large ? 16 : (compact ? 11 : 12.5) }
    private var detailSize: CGFloat { large ? 12.5 : (compact ? 9 : 10) }
    private var checkSize: CGFloat { large ? 18 : (compact ? 12 : 14) }

    private var catColor: Color { LaChartColor.forCategory(workout.category) }

    private var rowContent: some View {
        HStack(spacing: large ? 10 : (compact ? 6 : 8)) {
            // Status indicator + sport icon.
            // Completed → solid green tint. Planned → dashed ring (no fill) so
            // it clearly reads as "to do, not done yet".
            ZStack {
                if done {
                    Circle()
                        .fill(LaChartColor.success.opacity(0.16))
                        .frame(width: circleD, height: circleD)
                } else {
                    Circle()
                        .fill(catColor.opacity(0.06))
                        .frame(width: circleD, height: circleD)
                    Circle()
                        .strokeBorder(catColor.opacity(0.55),
                                      style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                        .frame(width: circleD, height: circleD)
                }
                Image(systemName: sportSymbol(workout.sport))
                    .font(.system(size: iconSize, weight: .bold))
                    .foregroundColor(done ? LaChartColor.success : catColor)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(workout.title)
                    .font(.system(size: titleSize, weight: done ? .semibold : .medium))
                    .foregroundColor(done ? LaChartColor.ink : LaChartColor.ink.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                if let line = composeDetailLine(), !line.isEmpty {
                    Text(line)
                        .font(.system(size: detailSize, weight: .regular))
                        .foregroundColor(LaChartColor.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)

            // Green ✓ only when a PLANNED session was completed. A completed
            // workout that wasn't in the calendar plan gets no tick. Planned
            // (not-yet-done) rows keep the dashed "to do" marker.
            if done {
                if workout.planned == true {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: checkSize, weight: .bold))
                        .foregroundColor(LaChartColor.success)
                }
            } else {
                Image(systemName: "circle.dashed")
                    .font(.system(size: checkSize, weight: .bold))
                    .foregroundColor(catColor.opacity(0.5))
            }
        }
    }

    private func composeDetailLine() -> String? {
        var parts: [String] = []
        let dur = formatDuration(workout.durationSec)
        if !dur.isEmpty { parts.append(dur) }
        if let sub = workout.subtitle, !sub.isEmpty { parts.append(sub) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

// MARK: - Empty / stale states

struct EmptyHint: View {
    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(LaChartColor.muted)
            Text("Open LaChart")
                .font(.system(size: 11, weight: .heavy))
                .foregroundColor(LaChartColor.primary)
            Text("to sync data")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(LaChartColor.muted)
        }
    }
}

// MARK: - Small

struct SmallTodayView: View {
    let entry: FormFitnessEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text("LaChart")
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(0.4)
                    .foregroundColor(LaChartColor.mark)
                Spacer()
                Image("LaChartLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 13, height: 13)
            }

            if entry.snapshot.isEmptyState {
                Spacer(minLength: 0)
                HStack { Spacer(); EmptyHint(); Spacer() }
                Spacer(minLength: 0)
            } else {
                KPIRow(snapshot: entry.snapshot, compact: true)
                Divider().opacity(0.4)
                content
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private var content: some View {
        let completed = entry.snapshot.todayCompleted
        let planned   = entry.snapshot.todayPlanned

        if completed.isEmpty && planned.isEmpty {
            HStack(spacing: 6) {
                Image(systemName: "moon.zzz.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(LaChartColor.muted)
                Text("Rest day")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(LaChartColor.muted)
                Spacer()
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                // One completed (if any), then one planned that isn't already
                // covered by the completed list (matched by title).
                if let first = completed.first {
                    WorkoutRow(workout: first, done: true, compact: true)
                }
                let doneTitles = Set(completed.map { $0.title })
                let nextPlanned = planned.first(where: { !doneTitles.contains($0.title) })
                                  ?? planned.first
                if let plan = nextPlanned {
                    WorkoutRow(workout: plan, done: false, compact: true)
                }
            }
        }
    }
}

// MARK: - Medium

struct MediumTodayView: View {
    let entry: FormFitnessEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Brand mark top-right (+ a STALE chip when the cache is old).
            HStack(spacing: 5) {
                Spacer()
                if entry.isStale {
                    Text("STALE")
                        .font(.system(size: 9, weight: .heavy))
                        .foregroundColor(LaChartColor.warning)
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(LaChartColor.warning.opacity(0.14))
                        .clipShape(Capsule())
                }
                Image("LaChartLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 15, height: 15)
            }

            if entry.snapshot.isEmptyState {
                Spacer(minLength: 0)
                HStack { Spacer(); EmptyHint(); Spacer() }
                Spacer(minLength: 0)
            } else {
                Spacer(minLength: 2)
                // Big KPI row — fills the width with larger numbers.
                KPIRow(snapshot: entry.snapshot, big: true)
                Spacer(minLength: 8)
                Divider().opacity(0.35)
                Spacer(minLength: 8)
                content
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 12)
    }

    @ViewBuilder
    private var content: some View {
        let completed = entry.snapshot.todayCompleted
        let planned   = entry.snapshot.todayPlanned

        if completed.isEmpty && planned.isEmpty {
            HStack(spacing: 8) {
                Image(systemName: "moon.zzz.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(LaChartColor.muted)
                Text("Rest day")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(LaChartColor.muted)
                Spacer()
            }
        } else {
            // Bigger rows → fewer fit; show up to 3 and spread them to fill.
            let maxRows = 3
            let doneShown = Array(completed.prefix(maxRows))
            let planShown = Array(planned.prefix(max(0, maxRows - doneShown.count)))
            VStack(alignment: .leading, spacing: 10) {
                ForEach(doneShown) { w in
                    WorkoutRow(workout: w, done: true, large: true)
                }
                ForEach(planShown) { w in
                    WorkoutRow(workout: w, done: false, large: true)
                }
            }
        }
    }
}

// MARK: - Large

struct LargeTodayView: View {
    let entry: FormFitnessEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("LaChart")
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(0.4)
                    .foregroundColor(LaChartColor.mark)
                if entry.isStale {
                    Text("STALE")
                        .font(.system(size: 8, weight: .heavy))
                        .foregroundColor(LaChartColor.warning)
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(LaChartColor.warning.opacity(0.14))
                        .clipShape(Capsule())
                }
                Spacer()
                Image("LaChartLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 16, height: 16)
            }

            if entry.snapshot.isEmptyState {
                Spacer(minLength: 0)
                HStack { Spacer(); EmptyHint(); Spacer() }
                Spacer(minLength: 0)
            } else {
                KPIRow(snapshot: entry.snapshot)
                Divider().opacity(0.35)
                content
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 10)
    }

    @ViewBuilder
    private var content: some View {
        let completed = entry.snapshot.todayCompleted
        let todayPlan = entry.snapshot.todayPlanned
        let tmwPlan   = entry.snapshot.tomorrowPlanned

        VStack(alignment: .leading, spacing: 5) {
            label("TODAY")
            if completed.isEmpty && todayPlan.isEmpty {
                restRow
            } else {
                ForEach(Array(completed.prefix(3))) { w in WorkoutRow(workout: w, done: true) }
                ForEach(Array(todayPlan.prefix(3)))  { w in WorkoutRow(workout: w, done: false) }
            }

            if !tmwPlan.isEmpty {
                label("TOMORROW").padding(.top, 3)
                ForEach(Array(tmwPlan.prefix(3))) { w in WorkoutRow(workout: w, done: false) }
            }
        }
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .heavy))
            .tracking(0.7)
            .foregroundColor(LaChartColor.muted)
    }

    private var restRow: some View {
        HStack(spacing: 8) {
            Image(systemName: "moon.zzz.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(LaChartColor.muted)
            Text("Rest day")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(LaChartColor.muted)
            Spacer()
        }
    }
}

// MARK: - Widget

struct FormFitnessWidget: Widget {
    let kind: String = "FormFitnessWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FormFitnessProvider()) { entry in
            // iOS 17 requires `containerBackground` for the widget to render
            // without the system's grey fallback. Older OSes silently ignore.
            if #available(iOS 17.0, *) {
                FormFitnessWidgetView(entry: entry)
                    .containerBackground(.background, for: .widget)
            } else {
                FormFitnessWidgetView(entry: entry)
                    .padding(0)
            }
        }
        .configurationDisplayName("Today's Training")
        .description("Form / Fitness / Fatigue plus today's completed & planned workouts.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct FormFitnessWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: FormFitnessEntry
    var body: some View {
        Group {
            switch family {
            case .systemLarge:  LargeTodayView(entry: entry)
            case .systemMedium: MediumTodayView(entry: entry)
            default:            SmallTodayView(entry: entry)
            }
        }
        // Fallback: tapping anywhere that isn't a workout Link opens the app.
        .widgetURL(URL(string: "com.lachart.app://open"))
    }
}
