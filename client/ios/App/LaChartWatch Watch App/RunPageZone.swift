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
        ScrollView(showsIndicators: false) {
            VStack(spacing: LC.s4) {
                // Zone number badge
                Text("Z\(zone.id)")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundColor(zone.color)
                    .padding(.horizontal, LC.s6)
                    .padding(.vertical, 1)
                    .background(zone.color.opacity(0.2))
                    .cornerRadius(LC.r6)

                // Zone Czech name — scales aggressively (was a hard 92 pt)
                Text(zone.name)
                    .font(.system(size: 38, weight: .black, design: .rounded))
                    .foregroundColor(.lcText)
                    .minimumScaleFactor(0.3)
                    .lineLimit(1)

                // Lactate range
                Text(zone.lactateLabel)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(zone.color.opacity(0.9))

                // Zone scale bar
                ZoneScaleView(activeZone: live.zone)
                    .padding(.horizontal, LC.s8)
                    .padding(.vertical, LC.s4)

                // Primary metric (pace or power depending on zoneBasis)
                primaryMetric
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 2)
            .padding(.bottom, LC.s4)
        }
        .background(
            RadialGradient(
                colors: [zone.color.opacity(0.55), Color.lcBg],
                center: .center,
                startRadius: 10,
                endRadius: 105
            )
            .ignoresSafeArea()
        )
    }

    @ViewBuilder
    private var primaryMetric: some View {
        switch appState.zoneBasis {
        case .power:
            MetricView(label: "Power", value: "\(live.power)", unit: "W",
                       valueColor: .lcPrimaryLite, size: 34)
        case .hr:
            MetricView(label: "HR", value: "\(live.hr)", unit: "bpm",
                       valueColor: .lcAccent, size: 34)
        case .pace, .lactate:
            MetricView(label: "Pace", value: live.pace.paceString, unit: "/km",
                       valueColor: .lcSecondary, size: 34)
        }
    }
}

extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
