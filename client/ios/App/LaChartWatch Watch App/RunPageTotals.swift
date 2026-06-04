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
        ScrollView(showsIndicators: false) {
            VStack(spacing: LC.s4) {
                Text("Totals")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.lcText3)

                // 2-column grid — 6 tiles inevitably overflow short watches,
                // so wrap in ScrollView so users can flick to the bottom row.
                let tiles = makeTiles()
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())],
                          spacing: LC.s4) {
                    ForEach(tiles, id: \.label) { tile in
                        TileView(icon: tile.icon, label: tile.label,
                                 value: tile.value, color: tile.color)
                    }
                }
            }
            .padding(.horizontal, 2)
            .padding(.bottom, LC.s4)
        }
        .background(Color.lcBg)
    }

    private struct TileItem {
        let icon: String; let label: String; let value: String; let color: Color
    }

    private func makeTiles() -> [TileItem] {[
        TileItem(icon: "arrow.up.forward",
                 label: "Elevation",
                 value: String(format: "+%.0f m", live.elevation),
                 color: .lcTertiary),
        TileItem(icon: "metronome",
                 label: "Cadence",
                 value: live.cadence > 0 ? "\(live.cadence) spm" : "—",
                 color: .lcPrimaryLite),
        TileItem(icon: "thermometer.medium",
                 label: "CORE temp",
                 value: live.coreTemp > 0 ? String(format: "%.1f°C", live.coreTemp) : "—",
                 color: .lcAccent),
        TileItem(icon: "bolt.fill",
                 label: "Power",
                 value: live.power > 0 ? "\(live.power) W" : "—",
                 color: .lcPrimaryLite),
        TileItem(icon: "heart.fill",
                 label: "HR",
                 value: "\(live.hr) bpm",
                 color: .lcAccent),
        TileItem(icon: "flame.fill",
                 label: "Calories",
                 value: "\(live.calories) kcal",
                 color: .lcWarning),
    ]}
}
