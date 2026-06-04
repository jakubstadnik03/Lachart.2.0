// RunPageStryd.swift
// LaChartWatch
//
// Run page 4: Stryd running power screen.
// Power (86pt primaryLite) + 4 metric tiles.

import SwiftUI

struct RunPageStryd: View {

    @EnvironmentObject var appState: AppState
    private var live: LiveMetrics { appState.live }

    var body: some View {
        // Scrollable container so even the smallest watch (40 mm S4/SE)
        // can reach every tile if the big power value pushed something
        // off the bottom. The big number itself uses minimumScaleFactor
        // so it shrinks instead of forcing scrolling for typical values.
        ScrollView(showsIndicators: false) {
            VStack(spacing: LC.s4) {
                // Stryd branding label
                HStack(spacing: LC.s4) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.lcPrimaryLite)
                    Text("STRYD")
                        .font(.system(size: 9, weight: .bold))
                        .tracking(2)
                        .foregroundColor(.lcText3)
                }

                // Large power value — scales down if the watch is small
                VStack(spacing: 0) {
                    Text(live.power > 0 ? "\(live.power)" : "—")
                        .font(.system(size: 56, weight: .thin, design: .rounded))
                        .foregroundColor(.lcPrimaryLite)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    Text("WATT")
                        .font(.system(size: 9, weight: .bold))
                        .tracking(2)
                        .foregroundColor(.lcText3)
                }

                // 4 metric tiles in 2×2 grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())],
                          spacing: LC.s4) {
                    TileView(icon: "metronome", label: "Cadence",
                             value: live.cadence > 0 ? "\(live.cadence) spm" : "—",
                             color: .lcPrimaryLite)
                    TileView(icon: "arrow.up.and.down", label: "Vert. osc.",
                             value: live.vertOsc > 0 ? String(format: "%.1f cm", live.vertOsc) : "—",
                             color: .lcSecondary)
                    TileView(icon: "timer", label: "Ground",
                             value: live.groundContact > 0 ? "\(live.groundContact) ms" : "—",
                             color: .lcTertiary)
                    TileView(icon: "waveform.path.ecg", label: "LSS",
                             value: live.legSpring > 0 ? String(format: "%.1f kN/m", live.legSpring) : "—",
                             color: .lcWarning)
                }
            }
            .padding(.horizontal, 2)
            .padding(.bottom, LC.s4)
        }
        .background(Color.lcBg)
    }
}
