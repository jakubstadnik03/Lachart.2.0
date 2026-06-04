// RunNotificationsView.swift
// LaChartWatch
//
// Far-left pane of the outer pager — surfaces recent notifications so the
// user can glance at messages without leaving the workout. watchOS does
// not let third-party apps read the system notification feed, so we show
// LaChart's own in-workout messages: lap markers, lactate prompts, BLE
// disconnect warnings, coach pushes that landed during the run.
//
// Layout matches the rest of the run screens (lcBg, edge-to-edge,
// minimal padding so it shows nicely on 41 mm).

import SwiftUI

struct RunNotificationsView: View {

    @EnvironmentObject var appState: AppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "bell.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.lcPrimaryLite)
                    Text("Notifications")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundColor(.lcText)
                    Spacer()
                }
                .padding(.top, 4)

                let items = appState.runNotifications
                if items.isEmpty {
                    VStack(spacing: 6) {
                        Image(systemName: "tray")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundColor(.lcText2)
                        Text("No new messages")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.lcText2)
                        Text("Lap markers and prompts appear here during the run.")
                            .font(.system(size: 9))
                            .foregroundColor(.lcText2.opacity(0.7))
                            .multilineTextAlignment(.center)
                            .lineLimit(3)
                            .minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 24)
                } else {
                    ForEach(items) { n in
                        NotifRow(notif: n)
                    }
                }
            }
            .padding(.horizontal, 4)
        }
        .background(Color.lcBg.ignoresSafeArea())
    }
}

// MARK: - Row

private struct NotifRow: View {
    let notif: RunNotification

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: notif.icon)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(notif.tint)
                .frame(width: 16, height: 16)
                .padding(4)
                .background(Circle().fill(notif.tint.opacity(0.18)))
            VStack(alignment: .leading, spacing: 2) {
                Text(notif.title)
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundColor(.lcText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(notif.body)
                    .font(.system(size: 10))
                    .foregroundColor(.lcText2)
                    .lineLimit(3)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 0)
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.white.opacity(0.05))
        )
    }
}
