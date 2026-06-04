// ReadyView.swift
// LaChartWatch
//
// Screen 4: GPS status, sensor count, large green START button.

import SwiftUI

struct ReadyView: View {

    @EnvironmentObject var appState: AppState
    @State private var gpsLocked = false
    @State private var gpsCheckTask: Task<Void, Never>? = nil

    var body: some View {
        // Geometry-driven layout: scales everything to the watch screen
        // size so a 40 mm Series 4 doesn't clip the START circle and
        // a 49 mm Ultra doesn't waste space. Previously a fixed 132 pt
        // circle plus desktop-sized chip padding pushed the workout
        // name off the bottom of small watches.
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            // Reserve roughly 28 pt for chips, 18 pt for caption, gaps
            // either side. The circle fills what's left, capped so it
            // doesn't dominate larger watches.
            let circleSize = min(w * 0.62, h * 0.55, 150)

            ZStack {
                Color.lcBg.ignoresSafeArea()

                VStack(spacing: LC.s8) {
                    // GPS + sensor chips — equal width via frame(maxWidth)
                    // inside the HStack so they're always perfectly
                    // symmetric regardless of label length.
                    HStack(spacing: LC.s8) {
                        StatusBadge(
                            icon: "location.fill",
                            label: gpsLocked ? "GPS" : "GPS…",
                            color: gpsLocked ? .lcSuccess : .lcWarning
                        )
                        .frame(maxWidth: .infinity)

                        StatusBadge(
                            icon: "antenna.radiowaves.left.and.right",
                            label: "\(appState.connectedSensorCount) senzory",
                            color: appState.connectedSensorCount > 0 ? .lcSecondary : .lcText3
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .padding(.horizontal, LC.s4)

                    // START button — circle scaled to viewport
                    Button(action: { appState.beginWorkout() }) {
                        ZStack {
                            Circle()
                                .fill(Color.lcSuccess)
                                .frame(width: circleSize, height: circleSize)
                                .shadow(color: Color.lcSuccess.opacity(0.4), radius: 14)

                            Text("START")
                                .font(.system(size: circleSize * 0.18, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                        }
                    }
                    .buttonStyle(.plain)

                    // Selected workout name — keep it on-screen even when
                    // long ("Outdoor Run" was being cut off because the
                    // VStack overflowed the watch height).
                    if let wt = appState.selectedWorkout {
                        Text(wt.name)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.lcText3)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                            .padding(.horizontal, LC.s8)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.vertical, LC.s4)
            }
        }
        .onAppear { simulateGPSLock() }
        .onDisappear { gpsCheckTask?.cancel() }
    }

    private func simulateGPSLock() {
        guard appState.selectedWorkout?.hasGPS == true else {
            gpsLocked = true
            return
        }
        gpsCheckTask = Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run { gpsLocked = true }
        }
    }
}

// MARK: - StatusBadge

struct StatusBadge: View {
    let icon:  String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundColor(color)
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.lcText2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)            // share the row equally
        .padding(.horizontal, LC.s6)
        .padding(.vertical, LC.s6)
        .background(Color.lcCard)
        .cornerRadius(LC.r8)
    }
}
