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
        ZStack {
            Color.lcBg.ignoresSafeArea()

            VStack(spacing: LC.s6) {
                // Stryd branding label
                HStack(spacing: LC.s4) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 11))
                        .foregroundColor(.lcPrimaryLite)
                    Text("STRYD")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(2)
                        .foregroundColor(.lcText3)
                }
                .padding(.top, LC.s8)

                // Large power value
                VStack(spacing: 0) {
                    Text(live.power > 0 ? "\(live.power)" : "—")
                        .font(.system(size: LC.strydPowerSize, weight: .thin, design: .rounded))
                        .foregroundColor(.lcPrimaryLite)
                        .monospacedDigit()
                    Text("WATT")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(2)
                        .foregroundColor(.lcText3)
                }

                // 4 metric tiles in 2×2 grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())],
                          spacing: LC.s6) {
                    TileView(icon: "metronome", label: "Kadence",
                             value: live.cadence > 0 ? "\(live.cadence) spm" : "—",
                             color: .lcPrimaryLite)
                    TileView(icon: "arrow.up.and.down", label: "Vert. osc.",
                             value: live.vertOsc > 0 ? String(format: "%.1f cm", live.vertOsc) : "—",
                             color: .lcSecondary)
                    TileView(icon: "timer", label: "Kont. se zemí",
                             value: live.groundContact > 0 ? "\(live.groundContact) ms" : "—",
                             color: .lcTertiary)
                    TileView(icon: "waveform.path.ecg", label: "LSS",
                             value: live.legSpring > 0 ? String(format: "%.1f kN/m", live.legSpring) : "—",
                             color: .lcWarning)
                }
                .padding(.horizontal, LC.s4)

                Spacer()
            }
            .padding(.horizontal, LC.s8)
        }
    }
}
