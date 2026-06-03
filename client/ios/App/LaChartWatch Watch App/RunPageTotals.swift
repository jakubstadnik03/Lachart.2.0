// RunPageTotals.swift
// LaChartWatch
//
// Run page 3: 2×3 grid of metric tiles.
// Elevation · Cadence · CORE Temp · Power · HR · Calories

import SwiftUI

struct RunPageTotals: View {

    @EnvironmentObject var appState: AppState
    private var live: LiveMetrics { appState.live }

    var body: some View {
        ZStack {
            Color.lcBg.ignoresSafeArea()

            VStack(spacing: LC.s6) {
                Text("Celkové statistiky")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.lcText3)
                    .padding(.top, LC.s6)

                // 2-column grid
                let tiles = makeTiles()
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())],
                          spacing: LC.s6) {
                    ForEach(tiles, id: \.label) { tile in
                        TileView(icon: tile.icon, label: tile.label,
                                 value: tile.value, color: tile.color)
                    }
                }

                Spacer()
            }
            .padding(.horizontal, LC.s8)
        }
    }

    private struct TileItem {
        let icon: String; let label: String; let value: String; let color: Color
    }

    private func makeTiles() -> [TileItem] {[
        TileItem(icon: "arrow.up.forward",
                 label: "Převýšení",
                 value: String(format: "+%.0f m", live.elevation),
                 color: .lcTertiary),
        TileItem(icon: "metronome",
                 label: "Kadence",
                 value: live.cadence > 0 ? "\(live.cadence) spm" : "—",
                 color: .lcPrimaryLite),
        TileItem(icon: "thermometer.medium",
                 label: "CORE temp",
                 value: live.coreTemp > 0 ? String(format: "%.1f°C", live.coreTemp) : "—",
                 color: .lcAccent),
        TileItem(icon: "bolt.fill",
                 label: "Výkon",
                 value: live.power > 0 ? "\(live.power) W" : "—",
                 color: .lcPrimaryLite),
        TileItem(icon: "heart.fill",
                 label: "Tep",
                 value: "\(live.hr) bpm",
                 color: .lcAccent),
        TileItem(icon: "flame.fill",
                 label: "Kalorie",
                 value: "\(live.calories) kcal",
                 color: .lcWarning),
    ]}
}
