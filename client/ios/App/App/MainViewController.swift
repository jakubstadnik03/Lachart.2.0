//
//  MainViewController.swift
//  App
//
//  Capacitor bridge view controller subclass whose only job is to register
//  app-local custom plugins that are NOT npm packages.
//
//  Capacitor 6 only auto-registers plugins listed in `capacitor.config.json`'s
//  `packageClassList`, which `npx cap sync` regenerates from node_modules — so a
//  hand-added entry for our in-app plugin gets wiped on the next sync. Doing the
//  registration here in `capacitorDidLoad()` is sync-proof: it lives in code.
//

import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LaChartSharedPlugin())
    }
}
