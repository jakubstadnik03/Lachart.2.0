// RingTimerView.swift
// LaChartWatch
//
// Circular progress ring used in RunPageStructured.
// Shows fill progress (0–1) and renders with a given zone colour.

import SwiftUI

struct RingTimerView: View {
    let progress:  Double       // 0 … 1
    let remaining: TimeInterval
    let color:     Color
    var lineWidth: CGFloat = 8

    var body: some View {
        ZStack {
            // Background track
            Circle()
                .stroke(color.opacity(0.2), lineWidth: lineWidth)

            // Progress arc
            Circle()
                .trim(from: 0, to: CGFloat(progress.clamped(to: 0...1)))
                .stroke(
                    color,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 1.0), value: progress)
        }
    }
}
