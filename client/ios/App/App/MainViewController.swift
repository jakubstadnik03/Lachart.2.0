//
//  MainViewController.swift
//  App
//
//  Capacitor bridge view controller subclass that registers plugins Capacitor 6
//  fails to auto-discover: in-app custom plugins and pod-based HealthPlugin.
//

import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let bridge else {
            NSLog("[LaChart] HealthKit: bridge nil in capacitorDidLoad")
            return
        }
        bridge.registerPluginInstance(LaChartSharedPlugin())
        bridge.registerPluginInstance(LaChartHealthPlugin())
        NSLog("[LaChart] LaChartHealth registered")
    }
}
