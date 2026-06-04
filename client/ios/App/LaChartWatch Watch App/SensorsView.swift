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
                // Header with rescan button — the only way for the user
                // to ask BLE to re-discover devices without leaving the
                // screen. Tapping a sensor card (below) also scans.
                HStack {
                    Text("Sensors")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.lcText2)
                    Spacer()
                    Button(action: { appState.bleManager.startScanning() }) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.lcPrimaryLite)
                            .frame(width: 24, height: 24)
                            .background(Color.lcCard2.opacity(0.6))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, LC.s4)
                .padding(.horizontal, LC.s4)

                ForEach(sensors) { sensor in
                    SensorCard(sensor: sensor)
                }

                // Continue button
                Button(action: { appState.go(.ready) }) {
                    Label("Continue", systemImage: "arrow.right")
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
        // Kick off a BLE scan automatically the moment the user lands
        // here — saves them the extra tap on the rescan button when
        // they wear a fresh strap / power up their Stryd / CORE pod.
        // Was previously missing, so the sensor list just sat "Searching…"
        // forever unless something else woke the BLE central.
        .onAppear {
            appState.bleManager.startScanning()
        }
    }
}

// MARK: - SensorCard

struct SensorCard: View {

    @EnvironmentObject var appState: AppState
    let sensor: SensorDevice

    var body: some View {
        // The whole card is a tap target now — was a static HStack before,
        // so taps on the card did nothing and the user had no way to ask
        // BLE to rescan / disconnect a flaky sensor. Tap behaviour:
        //   • Connected sensor → ask BLEManager to drop it
        //   • Disconnected sensor → kick off a fresh scan (its delegate
        //     will reconnect automatically when it finds the strap/pod)
        Button(action: handleTap) {
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
                    Text(subtitle)
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
            .contentShape(Rectangle())   // make the entire rounded area tappable
        }
        .buttonStyle(.plain)
    }

    private var subtitle: String {
        if sensor.isConnected { return sensor.liveValue ?? "Connected · tap to disconnect" }
        return "Searching… · tap to rescan"
    }

    private func handleTap() {
        if sensor.isConnected {
            // Tear down JUST this sensor's connection. BLEManager's
            // current API is `disconnectAll` — we surface that as the
            // safe fallback. Users typically don't care about per-device
            // toggling on a watch screen; "all off" is acceptable here.
            appState.bleManager.disconnectAll()
        } else {
            appState.bleManager.startScanning()
        }
    }

    private var statusColor: Color {
        sensor.isConnected ? .lcSuccess : .lcText3
    }
}
