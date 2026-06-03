// WatchConnectivityManager.swift
// LaChartWatch
//
// Sends workout summary to the companion iPhone app via WatchConnectivity.

import Foundation
import WatchConnectivity
import Combine

@MainActor
final class WatchConnectivityManager: NSObject, ObservableObject {

    @Published var lastSentDate: Date?  = nil
    @Published var transferError: String? = nil
    @Published var isReachable: Bool = false

    static let shared = WatchConnectivityManager()

    private override init() {
        super.init()
        activateSession()
    }

    // MARK: - Session

    private func activateSession() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: - Public API

    /// Sends a full workout summary to iPhone.
    /// Uses sendMessage when reachable, otherwise transferUserInfo (queued).
    func sendWorkoutSummary(_ summary: WorkoutSummary) async {
        guard WCSession.isSupported() else { return }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(summary) else { return }
        guard let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        let payload: [String: Any] = [
            "type":    "workoutSummary",
            "payload": dict
        ]

        let session = WCSession.default
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil) { [weak self] error in
                Task { @MainActor in
                    self?.transferError = error.localizedDescription
                }
            }
        } else {
            // Queue for background delivery
            session.transferUserInfo(payload)
        }

        lastSentDate = Date()
    }

    /// Send real-time lactate reading (taken manually on iPhone, echoed to watch)
    func requestLactateSync() {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["type": "requestLactate"], replyHandler: nil)
    }

    /// Update complications (LT2 pace, form score, load)
    func updateComplications(lt2Pace: TimeInterval, formScore: Int, load: Int) {
        guard WCSession.isSupported() else { return }
        let info: [String: Any] = [
            "type":      "complicationUpdate",
            "lt2Pace":   lt2Pace,
            "formScore": formScore,
            "load":      load
        ]
        WCSession.default.transferCurrentComplicationUserInfo(info)
    }
}

// MARK: - WCSessionDelegate

extension WatchConnectivityManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession,
                             activationDidCompleteWith activationState: WCSessionActivationState,
                             error: Error?) {
        Task { @MainActor in
            self.isReachable = session.isReachable
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.isReachable = session.isReachable
        }
    }

    nonisolated func session(_ session: WCSession,
                             didReceiveMessage message: [String: Any]) {
        Task { @MainActor in
            guard let type = message["type"] as? String else { return }
            switch type {
            case "lactateReading":
                // iPhone sent a new lactate reading — post notification
                NotificationCenter.default.post(name: .lactateReadingReceived, object: message)
            default:
                break
            }
        }
    }

    nonisolated func session(_ session: WCSession,
                             didReceiveUserInfo userInfo: [String: Any]) {
        // Handle queued messages from iPhone
        self.session(session, didReceiveMessage: userInfo)
    }
}

// MARK: - Notification names

extension Notification.Name {
    static let lactateReadingReceived = Notification.Name("lactateReadingReceived")
}
