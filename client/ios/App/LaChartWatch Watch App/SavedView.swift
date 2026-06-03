// SavedView.swift
// LaChartWatch
//
// Screen 10: Saved confirmation — check icon, sync label,
// auto-returns to watch face after 1.7 s.

import SwiftUI

struct SavedView: View {

    @State private var checkScale:   CGFloat = 0
    @State private var checkOpacity: Double  = 0

    var body: some View {
        ZStack {
            Color.lcBg.ignoresSafeArea()

            VStack(spacing: LC.s12) {
                Spacer()

                // Animated check circle
                ZStack {
                    Circle()
                        .fill(Color.lcSuccess.opacity(0.15))
                        .frame(width: 70, height: 70)
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 48))
                        .foregroundColor(.lcSuccess)
                        .scaleEffect(checkScale)
                        .opacity(checkOpacity)
                }

                Text("Uloženo")
                    .font(.system(size: 18, weight: .semibold, design: .rounded))
                    .foregroundColor(.lcText)
                    .opacity(checkOpacity)

                // Sync label
                HStack(spacing: LC.s4) {
                    Image(systemName: "checkmark.icloud.fill")
                        .font(.system(size: 11))
                        .foregroundColor(.lcSecondary)
                    Text("Synchronizováno · lachart.net")
                        .font(.system(size: 10))
                        .foregroundColor(.lcText3)
                }
                .opacity(checkOpacity)

                Spacer()
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                checkScale   = 1.0
                checkOpacity = 1.0
            }
        }
    }
}
