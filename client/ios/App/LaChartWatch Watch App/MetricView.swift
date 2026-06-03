// MetricView.swift
// LaChartWatch
//
// Reusable metric component: small label above, large value, small unit.

import SwiftUI

struct MetricView: View {
    let label:      String
    let value:      String
    let unit:       String
    var valueColor: Color = .lcText
    var labelColor: Color = .lcText3
    var size:       CGFloat = 28

    var body: some View {
        VStack(spacing: 1) {
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(labelColor)

            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: size, weight: .semibold, design: .rounded))
                    .foregroundColor(valueColor)
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)

                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: size * 0.38, weight: .medium))
                        .foregroundColor(labelColor)
                }
            }
        }
    }
}
