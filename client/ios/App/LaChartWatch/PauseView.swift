// PauseView.swift
// LaChartWatch
//
// Screen 7: Pause screen — Resume / Lap / Lock / End buttons.

import SwiftUI

struct PauseView: View {

    @EnvironmentObject var appState: AppState
    @State private var showEndConfirm = false

    var body: some View {
        ZStack {
            Color.lcBg.ignoresSafeArea()

            VStack(spacing: LC.s8) {
                // Elapsed during pause
                Text(appState.elapsed.mmss)
                    .font(.system(size: 32, weight: .thin, design: .rounded))
                    .foregroundColor(.lcText3)
                    .monospacedDigit()
                    .padding(.top, LC.s8)

                Text("Pozastaveno")
                    .font(.system(size: 11))
                    .foregroundColor(.lcText3)

                Spacer()

                // Action buttons grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())],
                          spacing: LC.s8) {
                    PauseButton(icon: "play.fill", label: "Pokračovat", color: .lcSuccess) {
                        appState.resumeWorkout()
                    }
                    PauseButton(icon: "flag.fill", label: "Kolo", color: .lcSecondary) {
                        appState.markLap()
                        appState.resumeWorkout()
                    }
                    PauseButton(icon: "lock.fill", label: "Zamknout", color: .lcPrimary) {
                        appState.lockScreen()
                    }
                    PauseButton(icon: "stop.fill", label: "Ukončit", color: .lcDanger) {
                        showEndConfirm = true
                    }
                }

                Spacer()
            }
            .padding(.horizontal, LC.s10)
        }
        .confirmationDialog("Ukončit trénink?", isPresented: $showEndConfirm) {
            Button("Uložit a ukončit", role: .destructive) {
                Task { await appState.endWorkout() }
            }
            Button("Zrušit", role: .cancel) {}
        }
    }
}

// MARK: - PauseButton

struct PauseButton: View {
    let icon:   String
    let label:  String
    let color:  Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: LC.s4) {
                ZStack {
                    Circle()
                        .fill(color.opacity(0.2))
                        .frame(width: 40, height: 40)
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(color)
                }
                Text(label)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(.lcText2)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, LC.s8)
            .background(Color.lcCard)
            .cornerRadius(LC.r10)
        }
        .buttonStyle(.plain)
    }
}
