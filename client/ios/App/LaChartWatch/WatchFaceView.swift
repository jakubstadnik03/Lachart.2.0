// WatchFaceView.swift
// LaChartWatch
//
// Screen 1: Watch face — purple radial background, time, LCMark logo,
// 3 complication pills (LT2 pace, Form, Load).

import SwiftUI

struct WatchFaceView: View {

    @EnvironmentObject var appState: AppState
    @State private var currentTime = Date()
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    // Complication data from WatchConnectivity (fallback to placeholder)
    @State private var lt2Pace:   String = "4:12"
    @State private var formScore: String = "82"
    @State private var load:      String = "347"

    var body: some View {
        ZStack {
            // Radial purple background
            RadialGradient(
                colors: [Color.lcPrimary.opacity(0.45), Color.lcBg],
                center: .center,
                startRadius: 0,
                endRadius: 110
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // LCMark — LaChart wave logo
                LCMarkView()
                    .padding(.bottom, LC.s4)

                // Big time display
                Text(formattedTime)
                    .font(.system(size: LC.timeFontSize, weight: .thin, design: .rounded))
                    .foregroundColor(.lcText)
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)

                Spacer()

                // 3 complication pills
                HStack(spacing: LC.s6) {
                    ComplicationPill(label: "LT2", value: lt2Pace, color: .lcZ4)
                    ComplicationPill(label: "Form", value: formScore, color: .lcPrimary)
                    ComplicationPill(label: "Load", value: load, color: .lcAccent)
                }
                .padding(.bottom, LC.s12)
            }
            .padding(.horizontal, LC.s8)
        }
        .onTapGesture {
            appState.go(.select)
        }
        .onReceive(timer) { _ in
            currentTime = Date()
        }
        .onAppear {
            loadComplicationData()
        }
    }

    // MARK: - Helpers

    private var formattedTime: String {
        let cal = Calendar.current
        let h   = cal.component(.hour,   from: currentTime)
        let m   = cal.component(.minute, from: currentTime)
        return String(format: "%d:%02d", h, m)
    }

    private func loadComplicationData() {
        let defaults = UserDefaults(suiteName: "group.com.lachart.app")
        if let lt2 = defaults?.double(forKey: "lt2Pace"), lt2 > 0 {
            lt2Pace = TimeInterval(lt2).paceString
        }
        if let fs = defaults?.integer(forKey: "formScore"), fs > 0 {
            formScore = "\(fs)"
        }
        if let ld = defaults?.integer(forKey: "weeklyLoad"), ld > 0 {
            load = "\(ld)"
        }
    }
}

// MARK: - LCMark

/// The LaChart "∿" wave mark, rendered as a SwiftUI shape.
struct LCMarkView: View {
    var body: some View {
        Canvas { ctx, size in
            let w = size.width
            let h = size.height
            var path = Path()
            // Draw a sine-like wave similar to the LaChart logo
            path.move(to: CGPoint(x: 0, y: h * 0.5))
            path.addCurve(
                to: CGPoint(x: w * 0.5, y: h * 0.5),
                control1: CGPoint(x: w * 0.15, y: 0),
                control2: CGPoint(x: w * 0.35, y: h)
            )
            path.addCurve(
                to: CGPoint(x: w, y: h * 0.5),
                control1: CGPoint(x: w * 0.65, y: 0),
                control2: CGPoint(x: w * 0.85, y: h)
            )
            ctx.stroke(path, with: .color(.lcPrimary), lineWidth: 2)
        }
        .frame(width: 40, height: 16)
    }
}

// MARK: - ComplicationPill

struct ComplicationPill: View {
    let label: String
    let value: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.lcText3)
            Text(value)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundColor(color)
                .monospacedDigit()
        }
        .padding(.horizontal, LC.s8)
        .padding(.vertical, LC.s4)
        .background(Color.lcCard.opacity(0.8))
        .cornerRadius(LC.r8)
    }
}
