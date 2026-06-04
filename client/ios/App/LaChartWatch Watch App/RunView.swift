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

    // Continuous-valued page position driven by the Digital Crown. Snaps
    // to the nearest integer page on rest. We keep a continuous Double so
    // the crown feels analog (1 detent ≈ 1 page) while metricPage stays
    // an Int for view selection.
    @State private var crownPage: Double = 0
    @FocusState private var crownFocused: Bool

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
                // `.opacity` cross-fade reads smoother than slide here
                // because metric pages have wildly different layouts;
                // sliding would expose blank space at the edges.
                .transition(.opacity.combined(with: .scale(scale: 0.97)))
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

            // (Page label intentionally omitted — the user prefers a
            // clean run screen; right-edge dots already convey position.)
        }
        .contentShape(Rectangle())
        // Digital Crown drives the same metricPage state — one detent
        // ≈ one page. `from:through:by:` defines the legal range; the
        // crown free-runs in that interval and we snap to the nearest
        // integer in `onChange`. `isContinuous: false` makes it clamp
        // at the ends (so spinning past page 6 doesn't wrap to 0).
        .focusable(true)
        .focused($crownFocused)
        .digitalCrownRotation(
            $crownPage,
            from:           0,
            through:        Double(metricCount - 1),
            by:             1,
            sensitivity:    .medium,
            isContinuous:   false,
            isHapticFeedbackEnabled: true
        )
        .onChange(of: crownPage) { _, new in
            let snapped = Int(round(new))
            if snapped != metricPage {
                withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                    metricPage = snapped
                }
            }
        }
        .onAppear { crownFocused = true; crownPage = Double(metricPage) }
        .onChange(of: outerTab) { _, new in
            // Re-grab crown focus whenever we land back on the Metrics
            // pane — TabView steals focus when switching tabs.
            if new == 2 { crownFocused = true }
        }
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
                let pace      = appState.live.pace
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

    /// Vertical-only swipe — lowered to 25 pt so short flicks register
    /// (on a 41 mm watch most users only travel ~30–60 pt). We also use
    /// `predictedEndTranslation` so a quick flick counts the same as a
    /// long slow drag — matches Apple's own pager feel.
    ///
    ///   • swipe ↑ → next metric page
    ///   • swipe ↓ → previous metric page
    private var verticalSwipe: some Gesture {
        DragGesture(minimumDistance: 10)
            .onEnded { value in
                // Use predicted end so flicks (small actual translation,
                // large velocity) still cross the page threshold.
                let dyEnd = value.predictedEndTranslation.height
                let dxEnd = value.predictedEndTranslation.width
                guard abs(dyEnd) > abs(dxEnd), abs(dyEnd) > 25 else { return }

                let next: Int
                if dyEnd < 0 {
                    next = min(metricCount - 1, metricPage + 1)
                } else {
                    next = max(0, metricPage - 1)
                }
                if next != metricPage {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                        metricPage = next
                    }
                    // Keep crown state in sync so the next crown spin
                    // continues from the new page, not the previous one.
                    crownPage = Double(next)
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
