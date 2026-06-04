//
//  LaChartSharedPlugin.m
//  App
//
//  Capacitor 6 registers this plugin through the Swift `CAPBridgedPlugin`
//  conformance in LaChartSharedPlugin.swift (identifier / jsName /
//  pluginMethods). The legacy `CAP_PLUGIN(...)` macro is intentionally NOT
//  used here — defining it alongside the Swift conformance would duplicate the
//  jsName/pluginMethods registration and conflict. This file is kept (empty)
//  only so the existing Xcode "Compile Sources" reference stays valid.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>
