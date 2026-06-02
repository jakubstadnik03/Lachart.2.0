//
//  FormFitnessWidget.swift
//  LaChartWidget
//
//  TrainingPeaks-style "Today's Training" widget.
//
//    • Small  — Fitness · Form · Fatigue row + sport-icon + workout title
//    • Medium — Same KPIs + "Today's Training" header + workout details row
//                (duration · subtitle), or "Rest day" empty state.
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
        FormFitnessEntry(date: Date(), snapshot: .placeholder, isStale: false)
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
            let stale = Date().timeIntervalSince(snap.lastUpdated) > 86_400
            return FormFitnessEntry(date: Date(), snapshot: snap, isStale: stale)
        }
        return FormFitnessEntry(date: Date(), snapshot: .placeholder, isStale: false)
    }
}

// MARK: - Theme

enum LaChartColor {
    static let fitness = Color(red: 0.10, green: 0.45, blue: 0.95)
    static let form    = Color(red: 0.95, green: 0.55, blue: 0.05)
    static let fatigue = Color(red: 0.92, green: 0.30, blue: 0.45)
    static let primary = Color(red: 0.37, green: 0.40, blue: 0.71)
    static let muted   = Color(red: 0.55, green: 0.58, blue: 0.65)
    static let mark    = Color(red: 0.20, green: 0.20, blue: 0.85)

    static func forCategory(_ cat: String?) -> Color {
        switch (cat ?? "").lowercased() {
        case "recovery":          return Color(red: 0.38, green: 0.69, blue: 0.94)
        case "endurance":         return Color(red: 0.20, green: 0.83, blue: 0.60)
        case "tempo":             return Color(red: 0.55, green: 0.36, blue: 0.96)
        case "threshold", "lt2":  return Color(red: 0.96, green: 0.49, blue: 0.13)
        case "vo2max", "vo2":     return Color(red: 0.94, green: 0.27, blue: 0.27)
        case "strength":          return Color(red: 0.55, green: 0.36, blue: 0.96)
        default:                  return Color(red: 0.37, green: 0.40, blue: 0.71)
        }
    }
}

// MARK: - Sport icon

private func sportSystemName(_ sport: String?) -> String {
    switch (sport ?? "").lowercased() {
    case "bike", "ride", "cycle", "virtual": return "bicycle"
    case "swim":                              return "figure.pool.swim"
    case "strength", "gym", "weights":        return "dumbbell.fill"
    case "yoga":                              return "figure.yoga"
    default:                                  return "figure.run"
    }
}

// MARK: - Shared header (KPIs)

struct KPIRow: View {
    let snapshot: FormFitnessSnapshot
    var compact: Bool = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: compact ? 14 : 18) {
            kpi("\(snapshot.fitness)",          "Fitness", LaChartColor.fitness)
            kpi(formatSigned(snapshot.form),    "Form",    LaChartColor.form)
            kpi("\(snapshot.fatigue)",          "Fatigue", LaChartColor.fatigue)
        }
    }

    private func kpi(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .center, spacing: 0) {
            Text(value)
                .font(.system(size: compact ? 20 : 22, weight: .bold))
                .foregroundColor(color)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(label)
                .font(.system(size: compact ? 10 : 11, weight: .medium))
                .foregroundColor(color.opacity(0.95))
        }
    }

    private func formatSigned(_ v: Int) -> String { v >= 0 ? "+\(v)" : "\(v)" }
}

// MARK: - Workout block

struct WorkoutBlock: View {
    let snapshot: FormFitnessSnapshot
    var compact: Bool = false

    var body: some View {
        if let title = snapshot.workoutTitle {
            HStack(alignment: .center, spacing: compact ? 8 : 10) {
                Image(systemName: sportSystemName(snapshot.workoutSport))
                    .font(.system(size: compact ? 18 : 20, weight: .semibold))
                    .foregroundColor(LaChartColor.forCategory(snapshot.workoutCategory))
                    .frame(width: compact ? 22 : 28, height: compact ? 22 : 28)

                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: compact ? 14 : 15, weight: .semibold))
                        .foregroundColor(.primary)
                        .lineLimit(compact ? 2 : 1)
                    if !compact, let subtitle = workoutDetailLine() {
                        Text(subtitle)
                            .font(.system(size: 12, weight: .regular))
                            .foregroundColor(LaChartColor.muted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
        } else {
            HStack(spacing: 8) {
                Image(systemName: "moon.zzz.fill")
                    .font(.system(size: compact ? 16 : 20, weight: .semibold))
                    .foregroundColor(LaChartColor.muted)
                Text("Rest day")
                    .font(.system(size: compact ? 13 : 15, weight: .semibold))
                    .foregroundColor(LaChartColor.muted)
                Spacer(minLength: 0)
            }
        }
    }

    private func workoutDetailLine() -> String? {
        var parts: [String] = []
        if let secs = snapshot.workoutDurationSec, secs > 0 {
            parts.append(formatDuration(secs))
        }
        if let extra = snapshot.workoutSubtitle, !extra.isEmpty {
            parts.append(extra)
        }
        return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
    }

    private func formatDuration(_ s: Int) -> String {
        let h = s / 3600
        let m = (s % 3600) / 60
        let sec = s % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, sec)
        }
        return String(format: "%d:%02d", m, sec)
    }
}

// MARK: - Small

struct SmallTodayView: View {
    let entry: FormFitnessEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 4) {
                KPIRow(snapshot: entry.snapshot, compact: true)
                Spacer(minLength: 0)
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundColor(LaChartColor.mark)
            }
            Spacer(minLength: 0)
            WorkoutBlock(snapshot: entry.snapshot, compact: true)
            if entry.isStale {
                Text("Cache stale")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(.orange)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
    }
}

// MARK: - Medium

struct MediumTodayView: View {
    let entry: FormFitnessEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 0) {
                KPIRow(snapshot: entry.snapshot)
                Spacer(minLength: 0)
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundColor(LaChartColor.mark)
            }

            Divider().opacity(0.4)

            Text("TODAY'S TRAINING")
                .font(.system(size: 9, weight: .heavy))
                .tracking(0.8)
                .foregroundColor(LaChartColor.muted)

            WorkoutBlock(snapshot: entry.snapshot)

            if entry.isStale {
                Text("Data may be stale — open LaChart to refresh")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(.orange)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }
}

// MARK: - Widget registration

struct FormFitnessWidget: Widget {
    let kind: String = "FormFitnessWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FormFitnessProvider()) { entry in
            FormFitnessWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's Training")
        .description("Form / Fitness / Fatigue plus your planned workout for today.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct FormFitnessWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: FormFitnessEntry

    var body: some View {
        switch family {
        case .systemMedium: MediumTodayView(entry: entry)
        default:            SmallTodayView(entry: entry)
        }
    }
}

// MARK: - Preview

#if DEBUG
struct FormFitnessWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            FormFitnessWidgetView(entry: .init(date: Date(), snapshot: .placeholder, isStale: false))
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small")
            FormFitnessWidgetView(entry: .init(date: Date(), snapshot: .placeholder, isStale: false))
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium")
            FormFitnessWidgetView(entry: .init(date: Date(), snapshot: .placeholderRestDay, isStale: false))
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium · rest day")
        }
    }
}
#endif
