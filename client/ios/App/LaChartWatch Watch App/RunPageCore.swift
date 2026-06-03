// RunPageCore.swift
// LaChartWatch
//
// Run page 5: CORE body temperature sensor screen.
// Core temp (96pt coral) · Skin temp · Heat Strain Index gradient gauge.

import SwiftUI

struct RunPageCore: View {

    @EnvironmentObject var appState: AppState
    private var live: LiveMetrics { appState.live }

    var body: some View {
        ZStack {
            Color.lcBg.ignoresSafeArea()

            VStack(spacing: LC.s6) {
                // CORE branding
                HStack(spacing: LC.s4) {
                    Image(systemName: "thermometer.high")
                        .font(.system(size: 11))
                        .foregroundColor(.lcAccent)
                    Text("CORE")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(2)
                        .foregroundColor(.lcText3)
                }
                .padding(.top, LC.s6)

                // Core temperature — large
                VStack(spacing: 0) {
                    Text(live.coreTemp > 0 ? String(format: "%.1f", live.coreTemp) : "—")
                        .font(.system(size: LC.coreTempSize, weight: .thin, design: .rounded))
                        .foregroundColor(.lcAccent)
                        .monospacedDigit()
                    Text("°C jádrová")
                        .font(.system(size: 11))
                        .foregroundColor(.lcText3)
                }

                // Skin temp
                HStack {
                    Image(systemName: "hand.raised")
                        .font(.system(size: 12))
                        .foregroundColor(.lcTertiary)
                    Text("Kožní: \(live.skinTemp > 0 ? String(format: "%.1f°C", live.skinTemp) : "—")")
                        .font(.system(size: 12))
                        .foregroundColor(.lcText2)
                }

                // Heat Strain Index gauge
                VStack(spacing: LC.s4) {
                    HStack {
                        Text("HSI")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.lcText3)
                        Spacer()
                        Text(String(format: "%.1f / 10", live.hsi))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(hsiColor)
                    }
                    HeatStrainGauge(value: live.hsi)
                }
                .padding(.horizontal, LC.s8)

                Spacer()
            }
            .padding(.horizontal, LC.s8)
        }
    }

    private var hsiColor: Color {
        switch live.hsi {
        case ..<3:  return .lcSuccess
        case ..<6:  return .lcWarning
        default:    return .lcDanger
        }
    }
}

// MARK: - HeatStrainGauge

/// Horizontal gradient bar with a marker at current HSI position.
struct HeatStrainGauge: View {
    let value: Double  // 0–10

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                // Background track
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.lcCard2)
                    .frame(height: 8)

                // Gradient fill up to current value
                RoundedRectangle(cornerRadius: 4)
                    .fill(
                        LinearGradient(
                            colors: [.lcSuccess, .lcWarning, .lcDanger],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: geo.size.width * CGFloat(value / 10).clamped(to: 0...1),
                           height: 8)

                // Marker
                let markerX = geo.size.width * CGFloat(value / 10).clamped(to: 0...1) - 5
                Circle()
                    .fill(.white)
                    .frame(width: 10, height: 10)
                    .shadow(color: .black.opacity(0.4), radius: 2)
                    .offset(x: max(0, markerX))
            }
            .frame(height: 10)
        }
        .frame(height: 10)
        .animation(.spring(response: 0.5), value: value)
    }
}
