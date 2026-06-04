//
//  LaChartWatchSyncPlugin.swift
//  App
//
//  Capacitor plugin that bridges WatchConnectivity (WCSession) on the
//  iPhone side to the LaChart JS WebView. The Apple Watch app ends a
//  workout, builds a WorkoutSummary, and pushes it over WCSession.
//  Without this plugin the message lands in iOS but no listener catches
//  it — silent drop. Now we re-emit it as a Capacitor JS event so
//  initCapacitorShell.js can POST the workout to the backend.
//
//  JS API:
//    LaChartWatchSync.addListener('watchWorkoutReceived', (payload) => { ... })
//      payload: full WorkoutSummary JSON shipped from the watch
//    LaChartWatchSync.isWatchPaired() → { paired: Bool, installed: Bool, reachable: Bool }
//

import Foundation
import Capacitor
import WatchConnectivity

@objc(LaChartWatchSyncPlugin)
public class LaChartWatchSyncPlugin: CAPPlugin, WCSessionDelegate {

    /// Buffer to hold workouts that arrive before the JS listener is wired
    /// up (e.g. the app was cold-started by the watch transfer). They get
    /// flushed when JS calls `flushPending()`.
    private var pendingWorkouts: [[String: Any]] = []

    /// Capacitor calls `load()` immediately after the plugin instance is
    /// allocated. This is where we own the WCSession delegate — moving
    /// activation here (rather than first JS call) means we receive
    /// watch transfers even if the user hasn't navigated to the dashboard
    /// yet, which is critical for the "watch end-of-workout cold-start"
    /// path.
    override public func load() {
        guard WCSession.isSupported() else {
            print("[LaChartWatchSync] WCSession unsupported on this device")
            return
        }
        let session = WCSession.default
        session.delegate = self
        session.activate()
        print("[LaChartWatchSync] WCSession activated, watchAppInstalled=\(session.isWatchAppInstalled), reachable=\(session.isReachable)")
    }

    // MARK: - JS-callable methods ─────────────────────────────────────────

    @objc func isWatchPaired(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else {
            call.resolve(["paired": false, "installed": false, "reachable": false])
            return
        }
        let s = WCSession.default
        call.resolve([
            "paired":    s.isPaired,
            "installed": s.isWatchAppInstalled,
            "reachable": s.isReachable,
        ])
    }

    /// Flush any workouts the plugin received before the JS listener was
    /// ready. JS calls this once `watchWorkoutReceived` listener is attached.
    @objc func flushPending(_ call: CAPPluginCall) {
        let toFlush = pendingWorkouts
        pendingWorkouts.removeAll()
        for p in toFlush {
            self.notifyListeners("watchWorkoutReceived", data: p)
        }
        call.resolve(["flushed": toFlush.count])
    }

    // MARK: - WCSessionDelegate ──────────────────────────────────────────

    public func session(_ session: WCSession,
                        activationDidCompleteWith activationState: WCSessionActivationState,
                        error: Error?) {
        if let error = error {
            print("[LaChartWatchSync] activation error:", error.localizedDescription)
            return
        }
        print("[LaChartWatchSync] activation state:", activationState.rawValue)
    }

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        // Per Apple docs — re-activate to pair with the next watch.
        WCSession.default.activate()
    }

    /// Real-time messages (used when watch foreground while iPhone running).
    public func session(_ session: WCSession,
                        didReceiveMessage message: [String: Any],
                        replyHandler: @escaping ([String: Any]) -> Void) {
        forwardIfWorkout(message)
        replyHandler(["ok": true])
    }

    public func session(_ session: WCSession,
                        didReceiveMessage message: [String: Any]) {
        forwardIfWorkout(message)
    }

    /// Queued background transfers (used when iPhone not reachable at
    /// workout-end). This is the main path because the iPhone is usually
    /// in the user's pocket / on the desk during a run.
    public func session(_ session: WCSession,
                        didReceiveUserInfo userInfo: [String: Any] = [:]) {
        forwardIfWorkout(userInfo)
    }

    // MARK: - Dispatch ───────────────────────────────────────────────────

    private func forwardIfWorkout(_ payload: [String: Any]) {
        // The watch tags every WCSession message with a `type` field so
        // we don't blindly forward unrelated WatchConnectivity traffic
        // (e.g. application-context updates) to the JS WebView.
        let type = (payload["type"] as? String) ?? ""
        guard type == "workoutSummary" else { return }

        // Trip the listener on the main thread — Capacitor's notifyListeners
        // is thread-safe but JS handlers may touch UIKit.
        DispatchQueue.main.async {
            print("[LaChartWatchSync] forwarding workoutSummary to JS, keys=\(Array(payload.keys))")
            // If JS hasn't attached its listener yet (app cold-start),
            // park the payload so `flushPending()` can replay it later.
            if self.bridge?.viewController == nil {
                self.pendingWorkouts.append(payload)
            } else {
                self.notifyListeners("watchWorkoutReceived", data: payload)
                // Also buffer so flushPending after re-login still works.
                self.pendingWorkouts.append(payload)
            }
        }
    }
}
