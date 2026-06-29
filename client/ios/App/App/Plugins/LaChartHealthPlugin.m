//
//  LaChartHealthPlugin.m
//  App
//
//  Capacitor 6 registers this plugin through the Swift `CAPBridgedPlugin`
//  conformance in LaChartHealthPlugin.swift and MainViewController.registerPluginInstance.
//  Do NOT use the legacy CAP_PLUGIN macro here — it would duplicate registration
//  and can cause HealthKit auth calls to hang without returning to JS.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>
