// RunPageZone.swift
// LaChartWatch
//
// Run page 1: Full-screen zone page.
// Radial gradient filled with zone colour, zone name (92pt),
// lactate range, ZoneScale bar, primary metric.

import SwiftUI

struct RunPageZone: View {

    @EnvironmentObject var appState: AppState

    private var live: LiveMetrics { appState.live }
    private var zone: TrainingZone {
        TrainingZone.all[(live.zone - 1).clamped(to: 0...4)]
    }

    var body: some View {
        ZStack {
            // Full zone-colour radial background
            RadialGradient(
                colors: [zone.color.opacity(0.55), Color.lcBg],
                center: .center,
                startRadius: 10,
                endRadius: 105
            )
            .ignoresSafeArea()

            VStack(spacing: LC.s4) {
                // Zone number badge
                Text("Z\(zone.id)")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundColor(zone.color)
                    .padding(.horizontal, LC.s8)
                    .padding(.vertical, LC.s2)
                    .background(zone.color.opacity(0.2))
                    .cornerRadius(LC.r8)
                    .padding(.top, LC.s8)

                // Zone Czech name — 92pt
                Text(zone.nameCZ)
                    .font(.system(size: LC.zoneNameSize, weight: .black, design: .rounded))
                    .foregroundColor(.lcText)
                    .minimumScaleFactor(0.4)
                    .lineLimit(1)

                // Lactate range
                Text(zone.lactateLabel)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(zone.color.opacity(0.9))

                // Zone scale bar
                ZoneScaleView(activeZone: live.zone)
                    .padding(.horizontal, LC.s12)
                    .padding(.vertical, LC.s6)

                // Primary metric (pace or power depending on zoneBasis)
                primaryMetric

                Spacer()
            }
            .padding(.horizontal, LC.s8)
        }
    }

    @ViewBuilder
    private var primaryMetric: some View {
        switch appState.zoneBasis {
        case .power:
            MetricView(label: "Výkon", value: "\(live.power)", unit: "W",
                       valueColor: .lcPrimaryLite, size: 34)
        case .hr:
            MetricView(label: "Tep", value: "\(live.hr)", unit: "bpm",
                       valueColor: .lcAccent, size: 34)
        case .pace, .lactate:
            MetricView(label: "Tempo", value: live.pace.paceString, unit: "/km",
                       valueColor: .lcSecondary, size: 34)
        }
    }
}

extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
