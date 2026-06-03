// SummaryView.swift
// LaChartWatch
//
// Screen 9: Post-workout summary.
// Zone distribution bars · total tiles · LaChart AI insight card.

import SwiftUI

struct SummaryView: View {

    @EnvironmentObject var appState: AppState

    private var summary: WorkoutSummary? { appState.summary }

    var body: some View {
        ScrollView {
            VStack(spacing: LC.s10) {
                // Header
                VStack(spacing: LC.s2) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 24))
                        .foregroundColor(.lcSuccess)
                        .padding(.top, LC.s8)
                    Text("Trénink dokončen")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.lcText)
                }

                // Duration + Distance
                HStack(spacing: LC.s12) {
                    SummaryTopTile(label: "Čas",
                                  value: (summary?.duration ?? appState.elapsed).mmss,
                                  color: .lcPrimary)
                    SummaryTopTile(label: "Vzdálenost",
                                  value: String(format: "%.2f km",
                                                (summary?.distance ?? appState.live.distance) / 1000),
                                  color: .lcSecondary)
                }

                // Zone distribution bars
                VStack(alignment: .leading, spacing: LC.s4) {
                    Text("Zóny")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.lcText3)

                    ForEach(TrainingZone.all) { zone in
                        ZoneBar(zone: zone,
                                fraction: zoneFraction(zone.id),
                                seconds: zoneSeconds(zone.id))
                    }
                }
                .padding(LC.s10)
                .background(Color.lcCard)
                .cornerRadius(LC.r10)

                // Stats grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())],
                          spacing: LC.s6) {
                    StatTile(label: "Ø Tempo",
                             value: (summary?.avgPace ?? appState.live.avgPace).paceString + "/km",
                             icon: "figure.run")
                    StatTile(label: "Ø Tep",
                             value: "\(summary?.avgHR ?? appState.live.hr) bpm",
                             icon: "heart.fill")
                    StatTile(label: "Kalorie",
                             value: "\(summary?.calories ?? appState.live.calories) kcal",
                             icon: "flame.fill")
                    StatTile(label: "Převýšení",
                             value: "+\(Int(summary?.elevation ?? appState.live.elevation)) m",
                             icon: "arrow.up.right")
                }

                // AI Insight card
                if let insight = summary?.aiInsight ?? defaultInsight {
                    VStack(alignment: .leading, spacing: LC.s6) {
                        HStack(spacing: LC.s6) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 12))
                                .foregroundColor(.lcPrimary)
                            Text("LaChart AI")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.lcPrimaryLite)
                        }
                        Text(insight)
                            .font(.system(size: 11))
                            .foregroundColor(.lcText2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(LC.s10)
                    .background(Color.lcCard2)
                    .cornerRadius(LC.r10)
                    .overlay(
                        RoundedRectangle(cornerRadius: LC.r10)
                            .stroke(Color.lcPrimary.opacity(0.3), lineWidth: 1)
                    )
                }

                // Save button
                Button(action: { appState.saveSummary() }) {
                    Text("Uložit")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, LC.s10)
                        .background(Color.lcPrimary)
                        .cornerRadius(LC.r10)
                }
                .buttonStyle(.plain)
                .padding(.bottom, LC.s12)
            }
            .padding(.horizontal, LC.s8)
        }
        .background(Color.lcBg.ignoresSafeArea())
    }

    // MARK: - Zone data helpers

    private func zoneFraction(_ zoneId: Int) -> Double {
        summary?.zoneDistribution["Z\(zoneId)"] ?? 0
    }

    private func zoneSeconds(_ zoneId: Int) -> TimeInterval {
        let total = summary?.duration ?? appState.elapsed
        return total * zoneFraction(zoneId)
    }

    private var defaultInsight: String? {
        "Výborný trénink! Zkontroluj distribuci zón pro optimalizaci příštího tréninku."
    }
}

// MARK: - Sub-components

struct ZoneBar: View {
    let zone:     TrainingZone
    let fraction: Double
    let seconds:  TimeInterval

    var body: some View {
        HStack(spacing: LC.s6) {
            Text("Z\(zone.id)")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(zone.color)
                .frame(width: 18, alignment: .leading)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.lcCard2)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(zone.color)
                        .frame(width: geo.size.width * CGFloat(fraction))
                        .animation(.spring(response: 0.6), value: fraction)
                }
            }
            .frame(height: 8)

            Text(seconds.mmss)
                .font(.system(size: 9))
                .foregroundColor(.lcText3)
                .monospacedDigit()
                .frame(width: 34, alignment: .trailing)
        }
    }
}

struct SummaryTopTile: View {
    let label: String
    let value: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundColor(color)
                .monospacedDigit()
            Text(label)
                .font(.system(size: 9))
                .foregroundColor(.lcText3)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LC.s8)
        .background(Color.lcCard)
        .cornerRadius(LC.r8)
    }
}

struct StatTile: View {
    let label: String
    let value: String
    let icon:  String

    var body: some View {
        HStack(spacing: LC.s6) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(.lcPrimary)
            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundColor(.lcText)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                Text(label)
                    .font(.system(size: 9))
                    .foregroundColor(.lcText3)
            }
            Spacer()
        }
        .padding(LC.s8)
        .background(Color.lcCard)
        .cornerRadius(LC.r8)
    }
}
