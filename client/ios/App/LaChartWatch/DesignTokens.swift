// DesignTokens.swift
// LaChartWatch
//
// Design system tokens matching the LaChart brand.
// All colours sourced from styles.css handoff.

import SwiftUI

// MARK: - Color Palette

extension Color {
    // Brand
    static let lcPrimary     = Color(hex: "#767EB5")
    static let lcPrimaryDark = Color(hex: "#5E6590")
    static let lcPrimaryLite = Color(hex: "#9AA1CE")

    static let lcSecondary   = Color(hex: "#599FD0")
    static let lcTertiary    = Color(hex: "#7BC2EB")

    // Semantic
    static let lcAccent      = Color(hex: "#FF6B4A")
    static let lcSuccess     = Color(hex: "#4BA87D")
    static let lcWarning     = Color(hex: "#F59E0B")
    static let lcDanger      = Color(hex: "#E05347")

    // Backgrounds
    static let lcBg          = Color(hex: "#0B0C16")
    static let lcBg2         = Color(hex: "#12131F")
    static let lcCard        = Color(hex: "#1A1C2B")
    static let lcCard2       = Color(hex: "#23263A")

    // Lines / dividers
    static let lcLine        = Color(hex: "#2C3047")

    // Text
    static let lcText        = Color(hex: "#FFFFFF")
    static let lcText2       = Color(hex: "#AEB3CC")
    static let lcText3       = Color(hex: "#6E7494")

    // Training Zones
    static let lcZ1          = Color(hex: "#599FD0")   // Recovery   – blue
    static let lcZ2          = Color(hex: "#4BA87D")   // Endurance  – green
    static let lcZ3          = Color(hex: "#767EB5")   // Tempo      – purple
    static let lcZ4          = Color(hex: "#F59E0B")   // Threshold  – amber
    static let lcZ5          = Color(hex: "#FF6B4A")   // VO2max     – coral

    // Convenience: zone by 1-based index
    static func lcZone(_ index: Int) -> Color {
        switch index {
        case 1: return .lcZ1
        case 2: return .lcZ2
        case 3: return .lcZ3
        case 4: return .lcZ4
        case 5: return .lcZ5
        default: return .lcText3
        }
    }

    // MARK: Hex initialiser
    init(hex: String) {
        var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("#") { cleaned.removeFirst() }
        var rgb: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&rgb)
        let r = Double((rgb >> 16) & 0xFF) / 255
        let g = Double((rgb >>  8) & 0xFF) / 255
        let b = Double( rgb        & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

// MARK: - Spacing & Sizing

enum LC {
    // Spacing
    static let s2:  CGFloat = 2
    static let s4:  CGFloat = 4
    static let s6:  CGFloat = 6
    static let s8:  CGFloat = 8
    static let s10: CGFloat = 10
    static let s12: CGFloat = 12
    static let s16: CGFloat = 16
    static let s20: CGFloat = 20
    static let s24: CGFloat = 24
    static let s32: CGFloat = 32

    // Corner radii
    static let r6:  CGFloat = 6
    static let r8:  CGFloat = 8
    static let r10: CGFloat = 10
    static let r12: CGFloat = 12
    static let r16: CGFloat = 16

    // Watch face
    static let timeFontSize:    CGFloat = 118
    static let readyBtnSize:    CGFloat = 132
    static let zoneNameSize:    CGFloat = 92
    static let defaultPaceSize: CGFloat = 50
    static let defaultTimeSize: CGFloat = 84
    static let strydPowerSize:  CGFloat = 86
    static let coreTempSize:    CGFloat = 96
    static let lapTimeSize:     CGFloat = 72
}

// MARK: - Zone Model

enum ZoneBasis: String, CaseIterable {
    case lactate, hr, power, pace
}

struct TrainingZone: Identifiable {
    let id:      Int          // 1–5
    let name:    String       // e.g. "Recovery"
    let nameCZ:  String       // Czech label e.g. "Regenerace"
    let hex:     String
    var color:   Color { Color(hex: hex) }
    let lacMin:  Double?      // mmol/L (nil = no lower bound)
    let lacMax:  Double?      // mmol/L (nil = no upper bound)
    let hrRange: ClosedRange<Int>   // % max HR  (rough defaults)
    let paceRange: ClosedRange<Int> // sec/km  (rough defaults)
    let pwRange: ClosedRange<Int>   // watts  (rough defaults, FTP-relative)

    /// Human-readable lactate range string
    var lactateLabel: String {
        switch (lacMin, lacMax) {
        case (.none, let max?):   return "< \(max) mmol/L"
        case (let min?, .none):   return "> \(min) mmol/L"
        case (let min?, let max?): return "\(min)–\(max) mmol/L"
        default: return "—"
        }
    }
}

extension TrainingZone {
    static let all: [TrainingZone] = [
        TrainingZone(id: 1, name: "Recovery",  nameCZ: "Regenerace",  hex: "#599FD0",
                     lacMin: nil,  lacMax: 1.5, hrRange: 50...65,  paceRange: 330...420, pwRange: 0...55),
        TrainingZone(id: 2, name: "Endurance", nameCZ: "Vytrvalost", hex: "#4BA87D",
                     lacMin: 1.5,  lacMax: 2.0, hrRange: 65...75,  paceRange: 270...330, pwRange: 55...75),
        TrainingZone(id: 3, name: "Tempo",     nameCZ: "Tempo",      hex: "#767EB5",
                     lacMin: 2.0,  lacMax: 3.0, hrRange: 75...87,  paceRange: 230...270, pwRange: 75...90),
        TrainingZone(id: 4, name: "Threshold", nameCZ: "Práh",       hex: "#F59E0B",
                     lacMin: 3.0,  lacMax: 4.5, hrRange: 87...95,  paceRange: 200...230, pwRange: 90...105),
        TrainingZone(id: 5, name: "VO2max",    nameCZ: "VO₂max",     hex: "#FF6B4A",
                     lacMin: 4.5,  lacMax: nil, hrRange: 95...100, paceRange: 0...200,   pwRange: 105...200),
    ]

    static func zone(forLactate lac: Double) -> TrainingZone {
        all.first { z in
            let aboveMin = z.lacMin.map { lac >= $0 } ?? true
            let belowMax = z.lacMax.map { lac <  $0 } ?? true
            return aboveMin && belowMax
        } ?? all[4]
    }

    static func zone(forHRPercent pct: Int) -> TrainingZone {
        all.first { $0.hrRange.contains(pct) } ?? all[4]
    }

    static func zone(forPower w: Int, ftp: Int) -> TrainingZone {
        guard ftp > 0 else { return all[0] }
        let pct = w * 100 / ftp
        return all.first { $0.pwRange.contains(pct) } ?? all[4]
    }
}
