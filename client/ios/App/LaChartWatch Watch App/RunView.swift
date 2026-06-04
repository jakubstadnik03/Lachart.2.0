// RunView.swift
// LaChartWatch
//
// Run screen — four-pane horizontal pager wrapping a vertical metric
// stack, matching the Apple Workout app convention but extended with a
// far-left Notifications panel:
//
//   ┌──────────────┬────────┬──────────────────┬──────────┐
//   │ Notifications│ Music  │      Metrics     │ Controls │
//   │  (messages,  │ (Now   │  (7 pages, swipe │ (Pause / │
//   │   prompts)   │ Playing)│  ↑↓ to cycle)   │  Stop)   │
//   └──────────────┴────────┴──────────────────┴──────────┘
//        outerTab 0     1            2              3
//
//   • Horizontal swipe = TabView's native pager — fully reversible. The
//     user can swipe Music → Metrics → Controls → Notifications and back.
//   • On the Metrics pane: vertical drag cycles 7 metric pages
//     (Default · Zone · Lap · Totals · Stryd · Core · Map). TabView only
//     consumes horizontal gestures so vertical drag still reaches us.
//   • Double-tap on Metrics = markLap(); long-press 0.6 s = pause.
//
//   The vertical metric-page dots sit on the right edge of the Metrics
//   pane only, and a tiny "n/7 · PageName" label sits top-right.

import SwiftUI

struct RunView: View {

    @EnvironmentObject var appState: AppState

    // Outer horizontal pager position.
    //   0 Notifications · 1 Music · 2 Metrics · 3 Controls
    @State private var outerTab = 2

    // Inner vertical metric page position.
    //   0 Default · 1 Zone · 2 Lap · 3 Totals · 4 Stryd · 5 Core · 6 Map
    @State private var metricPage = 0

    private let metricCount = 7

    private var isStructured: Bool {
        appState.selectedWorkout?.isStructured ?? false
    }

    var body: some View {
        TabView(selection: $outerTab) {
            RunNotificationsView()
                .tag(0)

            RunMusicView()
                .background(Color.lcBg.ignoresSafeArea())
                .tag(1)

            metricsPane
                .tag(2)

            RunControlsView()
                .background(Color.lcBg.ignoresSafeArea())
                .tag(3)
        }
        .tabViewStyle(.page(indexDisplayMode: .automatic))
        .background(Color.lcBg.ignoresSafeArea())
    }

    // MARK: - Metrics pane (with vertical metric paging)

    @ViewBuilder
    private var metricsPane: some View {
        ZStack(alignment: .trailing) {
            currentMetricPage
                .id(metricPage)
                .transition(.opacity)
                .animation(.easeInOut(duration: 0.22), value: metricPage)
                .background(Color.lcBg.ignoresSafeArea())

            // Vertical dot column — right edge, all 7 dots.
            VStack {
                Spacer()
                VerticalPageDotsView(count: metricCount, current: metricPage)
                    .padding(.vertical, 6)
                    .padding(.horizontal, 4)
                    .background(Capsule().fill(Color.black.opacity(0.5)))
                Spacer()
            }
            .padding(.trailing, 2)
            .allowsHitTesting(false)

            // Top-right "n/7 · PageName" label.
            VStack {
                HStack(spacing: 4) {
                    Text("\(metricPage + 1)/\(metricCount)")
                        .font(.system(size: 9, weight: .heavy))
                        .foregroundColor(.lcPrimaryLite)
                    Text(metricPageName(metricPage))
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(.lcText2)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(Color.black.opacity(0.45)))
                .padding(.top, 2)
                Spacer()
            }
            .padding(.trailing, 14)
            .allowsHitTesting(false)
        }
        .contentShape(Rectangle())
        // Vertical-only drag — TabView swallows horizontal gestures so
        // this only fires for predominantly vertical drags. We still
        // guard `absDY > absDX` to ignore diagonal flicks.
        .highPriorityGesture(verticalSwipe)
        .simultaneousGesture(
            TapGesture(count: 2).onEnded {
                appState.markLap()
                // Surface the lap in the Notifications pane so the user
                // can swipe over and confirm it registered.
                let lapNumber = appState.live.lapHistory.count + 1
                let pace      = appState.live.lapPace
                appState.pushRunNotification(.lap(lapNumber, paceSec: pace))
            }
        )
        .onLongPressGesture(minimumDuration: 0.6) {
            appState.pauseWorkout()
        }
    }

    /// View for the metric page currently in focus.
    @ViewBuilder
    private var currentMetricPage: some View {
        metricPageContent(metricPage)
    }

    @ViewBuilder
    private func metricPageContent(_ idx: Int) -> some View {
        switch idx {
        case 0: if isStructured { RunPageStructured() } else { RunPageDefault() }
        case 1: RunPageZone()
        case 2: RunPageLap()
        case 3: RunPageTotals()
        case 4: RunPageStryd()
        case 5: RunPageCore()
        case 6: RunPageMap()
        default: RunPageDefault()
        }
    }

    private func metricPageName(_ idx: Int) -> String {
        switch idx {
        case 0: return isStructured ? "Plan" : "Main"
        case 1: return "Zone"
        case 2: return "Lap"
        case 3: return "Totals"
        case 4: return "Stryd"
        case 5: return "Core"
        case 6: return "Map"
        default: return ""
        }
    }

    /// Vertical-only swipe — predominantly vertical drag ≥ 40 pt.
    ///   • swipe ↑ → next metric page
    ///   • swipe ↓ → previous metric page
    private var verticalSwipe: some Gesture {
        DragGesture(minimumDistance: 20)
            .onEnded { value in
                let dy = value.translation.height
                let dx = value.translation.width
                guard abs(dy) > abs(dx), abs(dy) > 40 else { return }
                if dy < 0 {
                    metricPage = min(metricCount - 1, metricPage + 1)
                } else {
                    metricPage = max(0, metricPage - 1)
                }
            }
    }
}

// MARK: - VerticalPageDotsView

struct VerticalPageDotsView: View {
    let count:   Int
    let current: Int

    var body: some View {
        VStack(spacing: 7) {
            ForEach(0..<count, id: \.self) { i in
                if i == current {
                    Capsule()
                        .fill(Color.white)
                        .frame(width: 6, height: 13)
                        .shadow(color: Color.lcPrimaryLite.opacity(0.7), radius: 2)
                        .animation(.spring(response: 0.3), value: current)
                } else {
                    Circle()
                        .fill(Color.white.opacity(0.55))
                        .frame(width: 5, height: 5)
                }
            }
        }
    }
}

// MARK: - PageDotsView (legacy horizontal — kept for any older callers)

struct PageDotsView: View {
    let count:   Int
    let current: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { i in
                Circle()
                    .fill(i == current ? Color.lcPrimaryLite : Color.lcText2.opacity(0.45))
                    .frame(width: i == current ? 7 : 5,
                           height: i == current ? 7 : 5)
                    .animation(.spring(response: 0.3), value: current)
            }
        }
    }
}
