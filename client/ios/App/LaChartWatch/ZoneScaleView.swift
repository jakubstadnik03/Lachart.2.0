// ZoneScaleView.swift
// LaChartWatch
//
// 5-segment horizontal zone scale bar with active zone highlighted.

import SwiftUI

struct ZoneScaleView: View {
    let activeZone: Int  // 1–5

    var body: some View {
        HStack(spacing: 3) {
            ForEach(TrainingZone.all) { zone in
                ZoneSegment(zone: zone, isActive: zone.id == activeZone)
            }
        }
        .frame(height: 14)
    }
}

private struct ZoneSegment: View {
    let zone:     TrainingZone
    let isActive: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3)
                .fill(isActive ? zone.color : zone.color.opacity(0.25))
                .scaleEffect(y: isActive ? 1.4 : 1.0)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isActive)

            if isActive {
                Text("Z\(zone.id)")
                    .font(.system(size: 7, weight: .black))
                    .foregroundColor(.white)
            }
        }
        .frame(maxWidth: .infinity)
    }
}
