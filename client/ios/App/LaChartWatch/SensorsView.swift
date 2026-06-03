// SensorsView.swift
// LaChartWatch
//
// Screen 3: Sensor cards — CORE / Stryd / HR strap.
// Shows connection state and battery, allows manual connect/disconnect.

import SwiftUI

struct SensorsView: View {

    @EnvironmentObject var appState: AppState

    private var sensors: [SensorDevice] {
        [
            SensorDevice(id: "stryd", name: "Stryd",   sub: "Running Power",
                         icon: "bolt.fill",
                         isConnected: appState.connected["stryd"] ?? false,
                         battery: nil,
                         liveValue: appState.live.power > 0 ? "\(appState.live.power) W" : nil),
            SensorDevice(id: "core",  name: "CORE",    sub: "Body Temperature",
                         icon: "thermometer.medium",
                         isConnected: appState.connected["core"] ?? false,
                         battery: nil,
                         liveValue: appState.live.coreTemp > 0 ? String(format: "%.1f°C", appState.live.coreTemp) : nil),
            SensorDevice(id: "hr",    name: "HRM-Pro", sub: "Heart Rate",
                         icon: "heart.fill",
                         isConnected: appState.connected["hr"] ?? false,
                         battery: nil,
                         liveValue: appState.live.hr > 0 ? "\(appState.live.hr) bpm" : nil),
        ]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: LC.s8) {
                Text("Senzory")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.lcText2)
                    .padding(.top, LC.s4)

                ForEach(sensors) { sensor in
                    SensorCard(sensor: sensor)
                }

                // Continue button
                Button(action: { appState.go(.ready) }) {
                    Label("Pokračovat", systemImage: "arrow.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.lcText)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, LC.s10)
                        .background(Color.lcPrimary)
                        .cornerRadius(LC.r10)
                }
                .buttonStyle(.plain)
                .padding(.top, LC.s4)
            }
            .padding(.horizontal, LC.s8)
            .padding(.bottom, LC.s12)
        }
        .background(Color.lcBg.ignoresSafeArea())
    }
}

// MARK: - SensorCard

struct SensorCard: View {

    @EnvironmentObject var appState: AppState
    let sensor: SensorDevice

    var body: some View {
        HStack(spacing: LC.s10) {
            // Icon
            ZStack {
                Circle()
                    .fill(statusColor.opacity(0.2))
                    .frame(width: 34, height: 34)
                Image(systemName: sensor.icon)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(statusColor)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(sensor.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.lcText)
                Text(sensor.isConnected ? (sensor.liveValue ?? "Připojeno") : "Hledám…")
                    .font(.system(size: 11))
                    .foregroundColor(sensor.isConnected ? statusColor : .lcText3)
            }

            Spacer()

            // Connection indicator
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
                .overlay(
                    Circle()
                        .stroke(statusColor.opacity(0.3), lineWidth: 4)
                        .scaleEffect(sensor.isConnected ? 1.6 : 1.0)
                        .opacity(sensor.isConnected ? 0 : 0.7)
                        .animation(sensor.isConnected ? .none :
                            .easeInOut(duration: 1.0).repeatForever(autoreverses: true),
                                   value: sensor.isConnected)
                )
        }
        .padding(.horizontal, LC.s12)
        .padding(.vertical, LC.s10)
        .background(Color.lcCard)
        .cornerRadius(LC.r10)
        .overlay(
            RoundedRectangle(cornerRadius: LC.r10)
                .stroke(sensor.isConnected ? statusColor.opacity(0.4) : Color.clear, lineWidth: 1)
        )
    }

    private var statusColor: Color {
        sensor.isConnected ? .lcSuccess : .lcText3
    }
}
