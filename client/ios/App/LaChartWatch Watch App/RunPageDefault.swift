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
        ScrollView(showsIndicators: false) {
            // Tighter inter-row spacing + top-aligned VStack so the
            // timer hugs the top safe area instead of floating in the
            // middle. `s6` left ~20 pt of dead space between rows on
            // 41 mm; `s3` keeps the design hierarchy intact while
            // shifting every row visibly up.
            VStack(spacing: LC.s3) {
                // Elapsed time — fills the upper third of the watch
                // screen. minimumScaleFactor lets it shrink on small
                // watches without clipping.
                Text(live.elapsed.mmss)
                    .font(.system(size: 60, weight: .thin, design: .rounded))
                    .foregroundColor(.lcText)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
                    .frame(maxWidth: .infinity)

                // Pace row — uses full width
                HStack(spacing: LC.s4) {
                    MetricView(label: "Pace",
                               value: live.pace.paceString,
                               unit: "/km",
                               valueColor: .lcSecondary,
                               size: 26)
                        .frame(maxWidth: .infinity)
                    MetricView(label: "Ø Pace",
                               value: live.avgPace.paceString,
                               unit: "/km",
                               size: 26)
                        .frame(maxWidth: .infinity)
                }

                // HR + Distance
                HStack(spacing: LC.s4) {
                    MetricView(label: "HR",
                               value: "\(live.hr)",
                               unit: "bpm",
                               valueColor: .lcAccent,
                               size: 26)
                        .frame(maxWidth: .infinity)
                    MetricView(label: "Distance",
                               value: String(format: "%.2f", live.distance / 1000),
                               unit: "km",
                               size: 26)
                        .frame(maxWidth: .infinity)
                }
            }
            // Tight 2 pt side padding — content reaches almost to the edge,
            // mirroring how Apple Workout uses every available pixel on
            // the watch face. Previously sat at ~6-10 pt which wasted real
            // estate the user wanted to see metrics in.
            .padding(.horizontal, 2)
            .padding(.top, -4)         // pull content up under status bar
            .padding(.bottom, LC.s2)
        }
        .background(Color.lcBg)
    }
}
