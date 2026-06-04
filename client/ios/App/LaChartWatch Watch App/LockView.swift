// LockView.swift
// LaChartWatch
//
// Screen 8: Lock screen — water drop icon, Digital Crown to unlock.

import SwiftUI

struct LockView: View {

    @EnvironmentObject var appState: AppState
    @State private var crownValue: Double = 0
    @State private var unlockProgress: Double = 0
    @State private var isUnlocking = false

    // Threshold crown rotation to unlock (arbitrary unit)
    private let unlockThreshold: Double = 3.0

    var body: some View {
        ZStack {
            Color.lcBg.ignoresSafeArea()

            VStack(spacing: LC.s16) {
                Spacer()

                // Water drop icon
                Image(systemName: "drop.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.lcSecondary, .lcTertiary],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                Text("Locked")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.lcText)

                Text("Turn Digital Crown\nto unlock")
                    .font(.system(size: 11))
                    .foregroundColor(.lcText3)
                    .multilineTextAlignment(.center)

                // Unlock progress ring
                if unlockProgress > 0 {
                    ZStack {
                        Circle()
                            .stroke(Color.lcLine, lineWidth: 4)
                        Circle()
                            .trim(from: 0, to: unlockProgress / unlockThreshold)
                            .stroke(Color.lcSuccess, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .animation(.linear(duration: 0.1), value: unlockProgress)
                    }
                    .frame(width: 40, height: 40)
                }

                Spacer()

                Text("Lap continues")
                    .font(.system(size: 10))
                    .foregroundColor(.lcText3)
                    .padding(.bottom, LC.s12)
            }
            .padding(.horizontal, LC.s16)
        }
        // Digital Crown tracking via focusable + digitalCrownRotation
        .focusable()
        .digitalCrownRotation(
            $crownValue,
            from: 0,
            through: unlockThreshold,
            by: 0.1,
            sensitivity: .medium,
            isContinuous: false,
            isHapticFeedbackEnabled: true
        )
        .onChange(of: crownValue) { newVal in
            unlockProgress = newVal
            if newVal >= unlockThreshold {
                appState.unlockScreen()
            }
        }
    }
}
