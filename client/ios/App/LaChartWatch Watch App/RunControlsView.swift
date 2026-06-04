// RunControlsView.swift
// LaChartWatch
//
// Left-most run page: Apple-Workout-style control panel.
// Konec (end), Pauza (pause), Zámek (lock), Kolo (lap).

import SwiftUI

struct RunControlsView: View {

    @EnvironmentObject var appState: AppState

    var body: some View {
        ScrollView {
            VStack(spacing: LC.s16) {

                HStack(spacing: LC.s16) {
                    ControlButton(icon: "stop.fill",
                                  label: "End",
                                  color: .lcDanger) {
                        Task { await appState.endWorkout() }
                    }
                    ControlButton(icon: appState.paused ? "play.fill" : "pause.fill",
                                  label: appState.paused ? "Resume" : "Pause",
                                  color: .lcWarning) {
                        if appState.paused { appState.resumeWorkout() }
                        else { appState.pauseWorkout() }
                    }
                }

                HStack(spacing: LC.s16) {
                    ControlButton(icon: "lock.fill",
                                  label: "Lock",
                                  color: .lcSecondary) {
                        appState.lockScreen()
                    }
                    ControlButton(icon: "flag.fill",
                                  label: "Lap",
                                  color: .lcPrimary) {
                        appState.markLap()
                    }
                }
            }
            .padding(.horizontal, LC.s8)
            .padding(.vertical, LC.s12)
        }
        .background(Color.lcBg.ignoresSafeArea())
    }
}

// MARK: - ControlButton

struct ControlButton: View {
    let icon:   String
    let label:  String
    let color:  Color
    let action: () -> Void

    var body: some View {
        VStack(spacing: LC.s4) {
            Button(action: action) {
                ZStack {
                    Circle()
                        .fill(color.opacity(0.22))
                        .overlay(Circle().stroke(color, lineWidth: 1.5))
                    Image(systemName: icon)
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundColor(color)
                }
                .frame(width: 62, height: 62)
            }
            .buttonStyle(.plain)

            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.lcText2)
        }
    }
}
