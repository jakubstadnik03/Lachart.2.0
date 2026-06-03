// BLEManager.swift
// LaChartWatch
//
// CoreBluetooth manager that scans for:
//   • Stryd running pod  — Running Power Service (0x1818)
//   • CORE body temp     — custom service
//   • HR strap           — Heart Rate Service (0x180D)
//
// Characteristic parsing follows Bluetooth GATT specifications.

import Foundation
import CoreBluetooth
import Combine

// MARK: - UUIDs

private enum BLEUUID {
    // Standard services
    static let heartRateService      = CBUUID(string: "180D")
    static let runningPowerService   = CBUUID(string: "1818")

    // CORE body-temperature sensor (GREENTEK)
    static let coreService           = CBUUID(string: "00002000-0000-1000-8000-00805F9B34FB")

    // Standard characteristics
    static let hrMeasurement         = CBUUID(string: "2A37")

    // Running Power characteristics (GATT spec)
    static let runningPowerMeasure   = CBUUID(string: "2A64")  // Running Power
    static let runningCadence        = CBUUID(string: "2A5D")  // RSC Measurement (cadence fallback)

    // CORE characteristics
    static let coreTempChar          = CBUUID(string: "00002001-0000-1000-8000-00805F9B34FB")
    static let skinTempChar          = CBUUID(string: "00002002-0000-1000-8000-00805F9B34FB")
    static let hsiChar               = CBUUID(string: "00002003-0000-1000-8000-00805F9B34FB")
}

// MARK: - BLEManager

@MainActor
final class BLEManager: NSObject, ObservableObject {

    // MARK: - Stryd
    @Published var strydPower:       Int    = 0     // watts
    @Published var cadence:          Int    = 0     // steps/min
    @Published var groundContact:    Int    = 0     // ms
    @Published var vertOscillation:  Double = 0     // cm
    @Published var legSpring:        Double = 0     // kN/m
    @Published var strydConnected:   Bool   = false
    @Published var strydBattery:     Int?   = nil

    // MARK: - CORE
    @Published var coreTemp:         Double = 0     // °C
    @Published var skinTemp:         Double = 0     // °C
    @Published var hsi:              Double = 0     // 0–10
    @Published var coreConnected:    Bool   = false
    @Published var coreBattery:      Int?   = nil

    // MARK: - HR Strap
    @Published var bleHR:            Int    = 0
    @Published var hrConnected:      Bool   = false
    @Published var hrBattery:        Int?   = nil

    // MARK: - Scanner state
    @Published var isScanning:       Bool   = false
    @Published var error:            String? = nil

    // MARK: - Private
    private var central:       CBCentralManager!
    private var strydPeripheral: CBPeripheral?
    private var corePeripheral:  CBPeripheral?
    private var hrPeripheral:    CBPeripheral?

    // MARK: - Init

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    // MARK: - Public API

    func startScanning() {
        guard central.state == .poweredOn else { return }
        isScanning = true
        let services = [BLEUUID.heartRateService,
                        BLEUUID.runningPowerService,
                        BLEUUID.coreService]
        central.scanForPeripherals(withServices: services,
                                   options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }

    func stopScanning() {
        central.stopScan()
        isScanning = false
    }

    func disconnectAll() {
        [strydPeripheral, corePeripheral, hrPeripheral].compactMap { $0 }.forEach {
            central.cancelPeripheralConnection($0)
        }
    }
}

// MARK: - CBCentralManagerDelegate

extension BLEManager: CBCentralManagerDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            if central.state == .poweredOn {
                self.startScanning()
            } else {
                self.isScanning = false
                self.error = "Bluetooth unavailable: \(central.state.description)"
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDiscover peripheral: CBPeripheral,
                                    advertisementData: [String: Any],
                                    rssi RSSI: NSNumber) {
        Task { @MainActor in
            let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []

            if serviceUUIDs.contains(BLEUUID.runningPowerService), self.strydPeripheral == nil {
                self.strydPeripheral = peripheral
                central.connect(peripheral, options: nil)
            }
            if serviceUUIDs.contains(BLEUUID.coreService), self.corePeripheral == nil {
                self.corePeripheral = peripheral
                central.connect(peripheral, options: nil)
            }
            if serviceUUIDs.contains(BLEUUID.heartRateService), self.hrPeripheral == nil {
                self.hrPeripheral = peripheral
                central.connect(peripheral, options: nil)
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didConnect peripheral: CBPeripheral) {
        Task { @MainActor in
            peripheral.delegate = self
            peripheral.discoverServices(nil)

            if peripheral == self.strydPeripheral { self.strydConnected = true }
            if peripheral == self.corePeripheral  { self.coreConnected  = true }
            if peripheral == self.hrPeripheral    { self.hrConnected    = true }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDisconnectPeripheral peripheral: CBPeripheral,
                                    error: Error?) {
        Task { @MainActor in
            if peripheral == self.strydPeripheral {
                self.strydConnected = false
                self.strydPeripheral = nil
            }
            if peripheral == self.corePeripheral {
                self.coreConnected = false
                self.corePeripheral = nil
            }
            if peripheral == self.hrPeripheral {
                self.hrConnected = false
                self.hrPeripheral = nil
            }
            // Attempt reconnect
            self.startScanning()
        }
    }
}

// MARK: - CBPeripheralDelegate

extension BLEManager: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didDiscoverServices error: Error?) {
        guard error == nil, let services = peripheral.services else { return }
        for svc in services {
            peripheral.discoverCharacteristics(nil, for: svc)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didDiscoverCharacteristicsFor service: CBService,
                                error: Error?) {
        guard error == nil, let chars = service.characteristics else { return }
        for char in chars {
            if char.properties.contains(.notify) || char.properties.contains(.indicate) {
                peripheral.setNotifyValue(true, for: char)
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didUpdateValueFor characteristic: CBCharacteristic,
                                error: Error?) {
        guard error == nil, let data = characteristic.value else { return }

        Task { @MainActor in
            switch characteristic.uuid {
            case BLEUUID.hrMeasurement:
                self.parseHRMeasurement(data)

            case BLEUUID.runningPowerMeasure:
                self.parseRunningPower(data)

            case BLEUUID.runningCadence:
                self.parseRSCMeasurement(data)

            case BLEUUID.coreTempChar:
                // CORE: 16-bit little-endian, units 0.01 °C
                if data.count >= 2 {
                    let raw = Int(data[0]) | (Int(data[1]) << 8)
                    self.coreTemp = Double(raw) / 100.0
                }
            case BLEUUID.skinTempChar:
                if data.count >= 2 {
                    let raw = Int(data[0]) | (Int(data[1]) << 8)
                    self.skinTemp = Double(raw) / 100.0
                }
            case BLEUUID.hsiChar:
                // Single byte 0–100 scaled to 0–10
                if data.count >= 1 {
                    self.hsi = Double(data[0]) / 10.0
                }

            default: break
            }
        }
    }

    // MARK: - Parsing helpers

    /// Heart Rate Measurement (0x2A37)
    /// Flags byte: bit0 = HR format (0=uint8, 1=uint16), bit4 = RR-interval present
    private func parseHRMeasurement(_ data: Data) {
        guard data.count >= 2 else { return }
        let flags = data[0]
        let hrFormat = flags & 0x01
        let bpm: Int
        if hrFormat == 0 {
            bpm = Int(data[1])
        } else {
            guard data.count >= 3 else { return }
            bpm = Int(data[1]) | (Int(data[2]) << 8)
        }
        self.bleHR = bpm
    }

    /// Running Power Measurement (Stryd / GATT 0x2A64)
    /// Layout per Bluetooth SIG Running Power spec:
    ///   bytes 0-1: flags
    ///   bytes 2-3: Instantaneous Power (sint16, Watts)
    ///   byte  4:   Walking or Running Status (0=walking, 1=running)
    ///   bytes 5-6: Cadence (uint16, steps/min * 2 → divide by 2)
    ///   bytes 7-8: Stride Length (uint16, cm/100)
    ///   bytes 9-12: Ground Contact Time (uint32, 1/1024 s)
    private func parseRunningPower(_ data: Data) {
        guard data.count >= 4 else { return }
        // Flags
        let flags = UInt16(data[0]) | (UInt16(data[1]) << 8)

        // Instantaneous Power (sint16)
        let rawPower = Int16(bitPattern: UInt16(data[2]) | (UInt16(data[3]) << 8))
        self.strydPower = max(0, Int(rawPower))

        // Cadence (bit 1 in flags)
        if flags & 0x02 != 0, data.count >= 7 {
            let rawCad = UInt16(data[5]) | (UInt16(data[6]) << 8)
            self.cadence = Int(rawCad / 2)
        }

        // Stride length → vertical oscillation proxy (bit 2 in flags)
        if flags & 0x04 != 0, data.count >= 9 {
            let rawStride = UInt16(data[7]) | (UInt16(data[8]) << 8)
            // stride length in cm; vert osc is roughly 5% of stride
            let strideCm = Double(rawStride) / 100.0
            self.vertOscillation = strideCm * 0.05
        }

        // Ground Contact Time (bit 8 in flags)
        if flags & 0x100 != 0, data.count >= 13 {
            let raw = UInt32(data[9])
                    | UInt32(data[10]) << 8
                    | UInt32(data[11]) << 16
                    | UInt32(data[12]) << 24
            // units: 1/1024 s → ms
            self.groundContact = Int(Double(raw) / 1024.0 * 1000.0)
        }

        // Leg spring stiffness: approximate kN/m from power + cadence
        // LSS ≈ (π × Power) / (cadence/60 × vertOsc²) — simplified estimate
        if self.cadence > 0, self.vertOscillation > 0 {
            let cadHz = Double(self.cadence) / 60.0
            let oscM  = self.vertOscillation / 100.0
            self.legSpring = (Double.pi * Double(self.strydPower)) / (cadHz * oscM * oscM) / 1000.0
        }
    }

    /// RSC Measurement (0x2A53) — fallback cadence source
    private func parseRSCMeasurement(_ data: Data) {
        guard data.count >= 4 else { return }
        // byte 1: Instantaneous Cadence (uint8, steps/min)
        let rawCad = data[1]
        if rawCad > 0 { self.cadence = Int(rawCad) * 2 } // RSC = strides/min × 2
    }
}

// MARK: - CBManagerState description

extension CBManagerState: @retroactive CustomStringConvertible {
    public var description: String {
        switch self {
        case .unknown:      return "unknown"
        case .resetting:    return "resetting"
        case .unsupported:  return "unsupported"
        case .unauthorized: return "unauthorized"
        case .poweredOff:   return "powered off"
        case .poweredOn:    return "powered on"
        @unknown default:   return "unknown"
        }
    }
}
