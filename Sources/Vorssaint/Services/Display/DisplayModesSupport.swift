// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

/// Pure helpers for the display resolution switcher (the Better Display-style
/// feature): describing a `CGDisplayMode` in plain values, deduplicating and
/// ordering the list CoreGraphics hands back, and formatting what the picker
/// shows. No CoreGraphics types here — a `CGDisplayMode` cannot be built in a
/// test, so the service converts each live mode to `ModeDescriptor` before
/// calling into this file, which is what keeps every test exercising the
/// exact math the feature runs with.
enum DisplayModesSupport {
    /// One resolution CoreGraphics reports for a display, stripped down to
    /// the fields the picker and the dedupe logic need.
    struct ModeDescriptor: Equatable {
        let ioModeID: Int32
        let width: Int
        let height: Int
        let pixelWidth: Int
        let pixelHeight: Int
        let refreshRate: Double
        let usableForDesktopGUI: Bool

        init(ioModeID: Int32, width: Int, height: Int, pixelWidth: Int, pixelHeight: Int,
             refreshRate: Double, usableForDesktopGUI: Bool) {
            self.ioModeID = ioModeID
            self.width = width
            self.height = height
            self.pixelWidth = pixelWidth
            self.pixelHeight = pixelHeight
            self.refreshRate = refreshRate
            self.usableForDesktopGUI = usableForDesktopGUI
        }
    }

    /// What a mode actually looks like on screen: the pixel grid and the
    /// refresh rate, rounded to survive a round trip through disk. Two modes
    /// with the same identity are the same choice to a person even when
    /// CoreGraphics hands back different io mode ids for them (seen across
    /// reconnections, and occasionally within one scan).
    struct ModeIdentity: Hashable, Codable {
        let width: Int
        let height: Int
        let pixelWidth: Int
        let pixelHeight: Int
        let refreshRateTenths: Int

        init(width: Int, height: Int, pixelWidth: Int, pixelHeight: Int, refreshRate: Double) {
            self.width = width
            self.height = height
            self.pixelWidth = pixelWidth
            self.pixelHeight = pixelHeight
            self.refreshRateTenths = Int((refreshRate * 10).rounded())
        }
    }

    static func identity(for mode: ModeDescriptor) -> ModeIdentity {
        ModeIdentity(width: mode.width, height: mode.height,
                    pixelWidth: mode.pixelWidth, pixelHeight: mode.pixelHeight,
                    refreshRate: mode.refreshRate)
    }

    // MARK: - HiDPI

    /// A mode counts as HiDPI when its pixel grid is at least double the
    /// point size the desktop draws at, the same "Retina" test Apple silicon
    /// Macs report for their own scaled modes. `>=` rather than `==` so a
    /// panel that rounds its physical pixels slightly still reads as HiDPI.
    static func isHiDPI(width: Int, pixelWidth: Int) -> Bool {
        guard width > 0 else { return false }
        return pixelWidth >= width * 2
    }

    static func isHiDPI(_ mode: ModeDescriptor) -> Bool {
        isHiDPI(width: mode.width, pixelWidth: mode.pixelWidth)
    }

    // MARK: - Dedupe and ordering

    /// Keeps the modes actually worth offering: usable ones only, one row per
    /// distinct (width, height, pixelWidth, pixelHeight, refreshRate)
    /// combination. CoreGraphics can list the same visual choice more than
    /// once under different io mode ids; the first one found wins so the
    /// list order stays stable across a rebuild.
    static func deduplicated(_ modes: [ModeDescriptor]) -> [ModeDescriptor] {
        var seen = Set<ModeIdentity>()
        var result: [ModeDescriptor] = []
        for mode in modes where mode.usableForDesktopGUI {
            guard seen.insert(identity(for: mode)).inserted else { continue }
            result.append(mode)
        }
        return result
    }

    /// Highest resolution first, then the highest refresh rate at that
    /// resolution: the order a person expects a resolution picker to offer,
    /// with the display's native mode on top.
    static func sorted(_ modes: [ModeDescriptor]) -> [ModeDescriptor] {
        modes.sorted { lhs, rhs in
            let lhsArea = lhs.pixelWidth * lhs.pixelHeight
            let rhsArea = rhs.pixelWidth * rhs.pixelHeight
            if lhsArea != rhsArea { return lhsArea > rhsArea }
            if lhs.refreshRate != rhs.refreshRate { return lhs.refreshRate > rhs.refreshRate }
            let lhsHiDPI = isHiDPI(lhs)
            let rhsHiDPI = isHiDPI(rhs)
            if lhsHiDPI != rhsHiDPI { return lhsHiDPI }
            return lhs.width > rhs.width
        }
    }

    /// The saved mode may point at a resolution the display no longer offers
    /// (a different monitor took its port, or the panel dropped a mode after
    /// a firmware update). An exact identity match only — guessing at the
    /// closest one would apply a resolution nobody chose.
    static func mode(matching target: ModeIdentity, in modes: [ModeDescriptor]) -> ModeDescriptor? {
        modes.first { identity(for: $0) == target }
    }

    // MARK: - Formatting

    static func formattedResolution(width: Int, height: Int) -> String {
        "\(width) × \(height)"
    }

    /// A refresh rate of 0 means the display never reported one distinctly,
    /// true of most panels without ProMotion. Nothing honest to show, so the
    /// caller gets an empty string instead of a misleading "0 Hz".
    static func formattedRefreshRate(_ hz: Double) -> String {
        guard hz > 0, hz.isFinite else { return "" }
        let rounded = hz.rounded()
        guard abs(hz - rounded) >= 0.05 else { return "\(Int(rounded)) Hz" }
        return String(format: "%.2f Hz", hz)
    }

    /// The full label a resolution row shows: "1920 × 1080 @ 60 Hz", or
    /// without the rate suffix when the display reports none. HiDPI modes keep
    /// the same point size as their 1x pair, so the badge is what tells them
    /// apart in the picker.
    static func formattedMode(width: Int, height: Int, refreshRate: Double,
                              isHiDPI: Bool = false) -> String {
        let resolution = formattedResolution(width: width, height: height)
        let rate = formattedRefreshRate(refreshRate)
        var label = rate.isEmpty ? resolution : "\(resolution) @ \(rate)"
        if isHiDPI { label += " · HiDPI" }
        return label
    }
}
