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
        ZStack {
            Color.lcBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Current lap header
                VStack(spacing: 2) {
                    Text("KM \(live.lap)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.lcText3)

                    Text(live.elapsed.mmss)
                        .font(.system(size: LC.lapTimeSize, weight: .thin, design: .rounded))
                        .foregroundColor(.lcText)
                        .monospacedDigit()
                        .minimumScaleFactor(0.5)

                    HStack(spacing: LC.s12) {
                        MetricView(label: "Tempo", value: live.pace.paceString,
                                   unit: "/km", valueColor: .lcSecondary, size: 22)
                        MetricView(label: "Tep", value: "\(live.hr)",
                                   unit: "bpm", valueColor: .lcAccent, size: 22)
                    }
                }
                .padding(.top, LC.s8)

                Divider()
                    .background(Color.lcLine)
                    .padding(.vertical, LC.s6)

                // Lap history list
                if live.lapHistory.isEmpty {
                    Text("Žádné kola zatím")
                        .font(.system(size: 11))
                        .foregroundColor(.lcText3)
                        .padding(.top, LC.s8)
                } else {
                    ScrollView {
                        VStack(spacing: LC.s4) {
                            ForEach(live.lapHistory.reversed()) { lap in
                                LapRow(lap: lap)
                            }
                        }
                    }
                }

                Spacer()
            }
            .padding(.horizontal, LC.s10)
        }
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
