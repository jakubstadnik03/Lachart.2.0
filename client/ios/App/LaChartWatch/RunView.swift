// RunView.swift
// LaChartWatch
//
// Screen 6: 7 swipeable run pages (TabView .page style).
// Structured replaces Default when workout.isStructured.
// Page dots overlay at bottom.
// Side button → pause.

import SwiftUI

struct RunView: View {

    @EnvironmentObject var appState: AppState
    @State private var currentPage = 0

    private var isStructured: Bool {
        appState.selectedWorkout?.isStructured ?? false
    }

    var body: some View {
        ZStack {
            // TabView with page swipe
            TabView(selection: $currentPage) {
                if isStructured {
                    RunPageStructured()
                        .tag(0)
                } else {
                    RunPageDefault()
                        .tag(0)
                }
                RunPageZone()   .tag(1)
                RunPageLap()    .tag(2)
                RunPageTotals() .tag(3)
                RunPageStryd()  .tag(4)
                RunPageCore()   .tag(5)
                RunPageMap()    .tag(6)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            // Page dot indicator (bottom overlay)
            VStack {
                Spacer()
                PageDotsView(count: 7, current: currentPage)
                    .padding(.bottom, LC.s6)
            }
        }
        // Side button (Digital Crown press → pause via button role)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(action: { appState.pauseWorkout() }) {
                    Image(systemName: "pause.circle")
                }
            }
        }
        .background(Color.lcBg.ignoresSafeArea())
        // Tap to pause (long-press on watch face is not available; use two-finger tap as fallback)
        .onLongPressGesture(minimumDuration: 0.6) {
            appState.pauseWorkout()
        }
    }
}

// MARK: - PageDotsView

struct PageDotsView: View {
    let count:   Int
    let current: Int

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<count, id: \.self) { i in
                Circle()
                    .fill(i == current ? Color.lcPrimary : Color.lcText3.opacity(0.5))
                    .frame(width: i == current ? 6 : 4,
                           height: i == current ? 6 : 4)
                    .animation(.spring(response: 0.3), value: current)
            }
        }
    }
}
