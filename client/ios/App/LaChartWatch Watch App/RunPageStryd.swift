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
            // Tighter inter-row spacing (s2 instead of s4) pulls every
            // row up so the 2×2 grid clears the bottom edge on 41 mm
            // without losing the STRYD heading.
            VStack(spacing: LC.s2) {
                // Stryd branding label — kept, but compressed.
                HStack(spacing: LC.s4) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 9))
                        .foregroundColor(.lcPrimaryLite)
                    Text("STRYD")
                        .font(.system(size: 8, weight: .bold))
                        .tracking(1.5)
                        .foregroundColor(.lcText3)
                }
                .padding(.top, -2)        // slide into the top safe area

                // Large power value — reduced from 56 → 44 pt so the
                // tile grid sits ~12 pt higher.
                VStack(spacing: -2) {
                    Text(live.power > 0 ? "\(live.power)" : "—")
                        .font(.system(size: 44, weight: .thin, design: .rounded))
                        .foregroundColor(.lcPrimaryLite)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    Text("WATT")
                        .font(.system(size: 8, weight: .bold))
                        .tracking(2)
                        .foregroundColor(.lcText3)
                }

                // 4 metric tiles in 2×2 grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())],
                          spacing: LC.s2) {
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
            .padding(.top, -4)
            .padding(.bottom, LC.s2)
        }
        .background(Color.lcBg)
    }
}
