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
        ZStack {
            Color.lcBg.ignoresSafeArea()

            VStack(spacing: LC.s12) {
                // GPS + sensor status row
                HStack(spacing: LC.s16) {
                    StatusBadge(
                        icon: "location.fill",
                        label: gpsLocked ? "GPS" : "GPS…",
                        color: gpsLocked ? .lcSuccess : .lcWarning
                    )
                    StatusBadge(
                        icon: "antenna.radiowaves.left.and.right",
                        label: "\(appState.connectedSensorCount) senzory",
                        color: appState.connectedSensorCount > 0 ? .lcSecondary : .lcText3
                    )
                }

                // START button — 132pt green circle
                Button(action: { appState.beginWorkout() }) {
                    ZStack {
                        Circle()
                            .fill(Color.lcSuccess)
                            .frame(width: LC.readyBtnSize, height: LC.readyBtnSize)
                            .shadow(color: Color.lcSuccess.opacity(0.4), radius: 16)

                        Text("START")
                            .font(.system(size: 20, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                    }
                }
                .buttonStyle(.plain)

                // Selected workout name
                if let wt = appState.selectedWorkout {
                    Text(wt.name)
                        .font(.system(size: 11))
                        .foregroundColor(.lcText3)
                }
            }
        }
        .onAppear {
            simulateGPSLock()
        }
        .onDisappear {
            gpsCheckTask?.cancel()
        }
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
                .font(.system(size: 14))
                .foregroundColor(color)
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.lcText2)
        }
        .padding(.horizontal, LC.s10)
        .padding(.vertical, LC.s8)
        .background(Color.lcCard)
        .cornerRadius(LC.r8)
    }
}
