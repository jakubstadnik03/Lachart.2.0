// CountdownView.swift
// LaChartWatch
//
// Screen 5: 3 → 2 → 1 → GO! animated countdown on purple background.

import SwiftUI

struct CountdownView: View {

    let count: Int

    @State private var scale:   CGFloat = 0.5
    @State private var opacity: Double  = 0

    var body: some View {
        ZStack {
            // Purple bg
            RadialGradient(
                colors: [Color.lcPrimary, Color.lcPrimaryDark],
                center: .center,
                startRadius: 0,
                endRadius: 100
            )
            .ignoresSafeArea()

            VStack(spacing: LC.s8) {
                Text(countLabel)
                    .font(.system(size: count == 0 ? 52 : 80, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                    .scaleEffect(scale)
                    .opacity(opacity)
                    .shadow(color: .white.opacity(0.3), radius: 20)

                if count == 0 {
                    Text("GO!")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundColor(.white.opacity(0.8))
                        .opacity(opacity)
                }
            }
        }
        .onAppear { animate() }
        .onChange(of: count) { _ in animate() }
    }

    private var countLabel: String {
        count == 0 ? "GO!" : "\(count)"
    }

    private func animate() {
        scale   = 0.4
        opacity = 0
        withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
            scale   = 1.0
            opacity = 1.0
        }
    }
}
