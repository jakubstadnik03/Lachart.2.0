// ContentView.swift
// LaChartWatch
//
// Root view — routes to the correct screen based on AppState.screen.

import SwiftUI

struct ContentView: View {

    @EnvironmentObject var appState: AppState
    @Environment(\.isLuminanceReduced) var isLuminanceReduced

    var body: some View {
        ZStack {
            screenView
                .transition(.opacity)
                .animation(.easeInOut(duration: 0.25), value: appState.screen)

            // Toast overlay
            if let toast = appState.toast {
                VStack {
                    Spacer()
                    Text(toast)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.lcText)
                        .padding(.horizontal, LC.s12)
                        .padding(.vertical, LC.s6)
                        .background(Color.lcCard2)
                        .cornerRadius(LC.r16)
                        .padding(.bottom, LC.s12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                .animation(.spring(), value: toast)
            }
        }
        // Dim in always-on mode
        .opacity(isLuminanceReduced ? 0.35 : 1.0)
        .animation(.easeInOut(duration: 0.3), value: isLuminanceReduced)
    }

    @ViewBuilder
    private var screenView: some View {
        switch appState.screen {
        case .face:
            WatchFaceView()
        case .select:
            WorkoutSelectView()
        case .sensors:
            SensorsView()
        case .ready:
            ReadyView()
        case .countdown(let n):
            CountdownView(count: n)
        case .run:
            RunView()
        case .pause:
            PauseView()
        case .lock:
            LockView()
        case .summary:
            SummaryView()
        case .saved:
            SavedView()
        }
    }
}
