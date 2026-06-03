// TileView.swift
// LaChartWatch
//
// Card tile with SF Symbol icon, label, and value.

import SwiftUI

struct TileView: View {
    let icon:  String
    let label: String
    let value: String
    var color: Color = .lcPrimary

    var body: some View {
        VStack(alignment: .leading, spacing: LC.s4) {
            HStack(spacing: LC.s4) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(color)
                Text(label)
                    .font(.system(size: 9))
                    .foregroundColor(.lcText3)
                    .lineLimit(1)
            }

            Text(value)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundColor(.lcText)
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        }
        .padding(LC.s8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.lcCard)
        .cornerRadius(LC.r8)
    }
}
