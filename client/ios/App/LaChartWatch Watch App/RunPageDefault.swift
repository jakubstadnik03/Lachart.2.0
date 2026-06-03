// RunPageDefault.swift
// LaChartWatch
//
// Run page 0: Default metrics layout.
// Time (84pt) · Pace (50pt blue) · Avg Pace · HR (coral) · Distance

import SwiftUI

struct RunPageDefault: View {

    @EnvironmentObject var appState: AppState

    private var live: LiveMetrics { appState.live }

    var body: some View {
        ZStack {
            Color.lcBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Elapsed time — large
                Text(live.elapsed.mmss)
                    .font(.system(size: LC.defaultTimeSize, weight: .thin, design: .rounded))
                    .foregroundColor(.lcText)
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                    .padding(.top, LC.s8)

                // Pace row
                HStack(spacing: LC.s16) {
                    MetricView(label: "Tempo",
                               value: live.pace.paceString,
                               unit: "/km",
                               valueColor: .lcSecondary,
                               size: LC.defaultPaceSize)
                    MetricView(label: "Ø Tempo",
                               value: live.avgPace.paceString,
                               unit: "/km",
                               size: LC.defaultPaceSize)
                }
                .padding(.top, LC.s4)

                // HR + Distance
                HStack(spacing: LC.s16) {
                    MetricView(label: "Tep",
                               value: "\(live.hr)",
                               unit: "bpm",
                               valueColor: .lcAccent,
                               size: LC.defaultPaceSize)
                    MetricView(label: "Vzdálenost",
                               value: String(format: "%.2f", live.distance / 1000),
                               unit: "km",
                               size: LC.defaultPaceSize)
                }
                .padding(.top, LC.s4)

                Spacer()
            }
            .padding(.horizontal, LC.s10)
        }
    }
}
