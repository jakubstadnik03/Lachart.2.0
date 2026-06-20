//
//  MainViewController.swift
//  App
//
//  Capacitor bridge view controller subclass that registers plugins Capacitor 6
//  fails to auto-discover: in-app custom plugins and pod-based HealthPlugin.
//

import UIKit
import Capacitor
import CapgoCapacitorHealth

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let bridge else {
            NSLog("[LaChart] HealthKit: bridge nil in capacitorDidLoad")
            return
        }
        bridge.registerPluginInstance(LaChartSharedPlugin())
        bridge.registerPluginInstance(LaChartHealthPlugin())
        // Capgo HealthPlugin kept as fallback if pod registration works on a future Capacitor upgrade.
        bridge.registerPluginInstance(HealthPlugin())
        NSLog("[LaChart] LaChartHealth + HealthPlugin registered")
    }
}
