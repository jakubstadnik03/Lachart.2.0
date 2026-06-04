// RunPageLap.swift
// LaChartWatch
//
// Run page 2: Lap time (72pt), current lap pace + HR,
// scrollable lap history list.

import SwiftUI

struct RunPageLap: View {

    @EnvironmentObject var appState: AppState

    private var live: LiveMetrics { appState.live }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: LC.s2) {
                // Current lap header
                Text("KM \(live.lap)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.lcText3)

                Text(live.elapsed.mmss)
                    .font(.system(size: 44, weight: .thin, design: .rounded))
                    .foregroundColor(.lcText)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)

                HStack(spacing: LC.s8) {
                    MetricView(label: "Pace", value: live.pace.paceString,
                               unit: "/km", valueColor: .lcSecondary, size: 20)
                    MetricView(label: "HR", value: "\(live.hr)",
                               unit: "bpm", valueColor: .lcAccent, size: 20)
                }

                Divider()
                    .background(Color.lcLine)
                    .padding(.vertical, LC.s4)

                // Lap history list — flows into the page's own ScrollView
                if live.lapHistory.isEmpty {
                    Text("No laps yet")
                        .font(.system(size: 11))
                        .foregroundColor(.lcText3)
                        .padding(.top, LC.s4)
                } else {
                    VStack(spacing: LC.s2) {
                        ForEach(live.lapHistory.reversed()) { lap in
                            LapRow(lap: lap)
                        }
                    }
                }
            }
            .padding(.horizontal, 2)
            .padding(.bottom, LC.s4)
        }
        .background(Color.lcBg)
    }
}

// MARK: - LapRow

struct LapRow: View {
    let lap: LapData

    var body: some View {
        HStack {
            // Zone colour dot
            Circle()
                .fill(Color.lcZone(lap.zoneId))
                .frame(width: 6, height: 6)

            Text("Km \(lap.number)")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.lcText2)

            Spacer()

            Text(lap.pace.paceString)
                .font(.system(size: 12, design: .rounded))
                .foregroundColor(.lcSecondary)
                .monospacedDigit()

            Text(lap.time.mmss)
                .font(.system(size: 11))
                .foregroundColor(.lcText3)
                .monospacedDigit()
                .frame(width: 44, alignment: .trailing)
        }
        .padding(.horizontal, LC.s8)
        .padding(.vertical, LC.s4)
        .background(Color.lcCard.opacity(0.6))
        .cornerRadius(LC.r6)
    }
}
