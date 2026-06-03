// LaChartWatchApp.swift
// LaChartWatch
//
// App entry point.  Injects AppState into the SwiftUI environment.

import SwiftUI

@main
struct LaChartWatchApp: App {

    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
    }
}
