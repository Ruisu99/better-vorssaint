// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AppKit
import CoreGraphics
import os

/// One resolution a display can be switched to, trimmed to what the picker
/// shows. `id` is the io mode id CoreGraphics reports for THIS scan; it is
/// only used to look the live `CGDisplayMode` back up on the same service
/// instance, never persisted, since a reconnection can hand out a different
/// one for the very same resolution.
struct DisplayModeOption: Identifiable, Equatable {
    let id: Int32
    let width: Int
    let height: Int
    let pixelWidth: Int
    let pixelHeight: Int
    let refreshRate: Double

    var isHiDPI: Bool { DisplayModesSupport.isHiDPI(width: width, pixelWidth: pixelWidth) }
    var resolutionLabel: String { DisplayModesSupport.formattedResolution(width: width, height: height) }
    var refreshLabel: String { DisplayModesSupport.formattedRefreshRate(refreshRate) }
    var fullLabel: String {
        DisplayModesSupport.formattedMode(width: width, height: height,
                                          refreshRate: refreshRate, isHiDPI: isHiDPI)
    }
}

/// One display the resolution switcher can talk to.
struct DisplayModesDisplay: Identifiable, Equatable {
    let id: CGDirectDisplayID
    let name: String
    let isBuiltIn: Bool
    let modes: [DisplayModeOption]
    let currentModeID: Int32?

    var currentMode: DisplayModeOption? {
        guard let currentModeID else { return nil }
        return modes.first { $0.id == currentModeID }
    }
}

/// Better Display-style resolution switching, built entirely on public
/// CoreGraphics: `CGDisplayCopyAllDisplayModes` with
/// `kCGDisplayShowDuplicateLowResolutionModes` so HiDPI (Retina) modes are
/// listed next to 1x, then `CGConfigureDisplayWithDisplayMode` inside a
/// `CGBeginDisplayConfiguration` / `CGCompleteDisplayConfiguration`
/// transaction to apply one. Unlike the brightness feature's on/off switch,
/// applying a mode needs no private symbol at all, so there is no dlsym
/// bridge here.
///
/// While the feature is off there is no screen observer and no standing
/// state; everything below comes from a rescan triggered by opening the
/// panel, the Settings page, or a screen-parameters change.
final class DisplayModesService: ObservableObject {
    static let shared = DisplayModesService()

    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "vorssaint",
                                    category: "displayModes")

    @Published private(set) var displays: [DisplayModesDisplay] = []
    @Published private(set) var pendingDisplayIDs = Set<CGDirectDisplayID>()
    @Published private(set) var lastFailedDisplayID: CGDirectDisplayID?

    private var screenObserver: NSObjectProtocol?
    private var rebuildDebounce: DispatchWorkItem?
    private var running = false
    /// The live `CGDisplayMode` behind each option id, per display, from the
    /// most recent scan. Needed because applying a mode requires handing the
    /// CoreGraphics object itself back, not a description of it.
    private var liveModes: [CGDirectDisplayID: [Int32: CGDisplayMode]] = [:]

    private init() {}

    func syncWithPreferences() {
        let wanted = AppFeature.displayModes.isAvailable
            && UserDefaults.standard.bool(forKey: DefaultsKey.displayModesEnabled)
        if wanted { start() } else { stop() }
    }

    private func start() {
        guard !running else { return }
        running = true
        screenObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil, queue: .main) { [weak self] _ in
            self?.scheduleRefresh()
        }
        refresh()
    }

    func stop() {
        guard running else { return }
        running = false
        if let screenObserver { NotificationCenter.default.removeObserver(screenObserver) }
        screenObserver = nil
        rebuildDebounce?.cancel()
        rebuildDebounce = nil
        liveModes = [:]
        pendingDisplayIDs = []
        lastFailedDisplayID = nil
        if !displays.isEmpty { displays = [] }
    }

    /// Debounced the same way the brightness feature's screen-change handler
    /// is: a mode switch itself fires this notification, and rebuilding on
    /// every one of a short burst would repeat the same scan for nothing.
    private func scheduleRefresh() {
        guard running, rebuildDebounce == nil else { return }
        let work = DispatchWorkItem { [weak self] in
            self?.rebuildDebounce = nil
            self?.refresh()
        }
        rebuildDebounce = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: work)
    }

    /// Re-reads every display's mode list. Cheap enough to call whenever the
    /// panel section or the Settings page appears; CoreGraphics does the
    /// actual EDID work and nothing here polls.
    func refresh() {
        guard running else { return }
        var ids = [CGDirectDisplayID](repeating: 0, count: 16)
        var count: UInt32 = 0
        CGGetOnlineDisplayList(16, &ids, &count)
        let onlineIDs = Array(ids.prefix(Int(count)))
        let screenNames = Self.localizedScreenNames()

        var built: [DisplayModesDisplay] = []
        var modesByDisplay: [CGDirectDisplayID: [Int32: CGDisplayMode]] = [:]

        for id in onlineIDs {
            // A mirroring display follows its source; only the source has a
            // mode list worth switching.
            guard CGDisplayMirrorsDisplay(id) == 0 else { continue }
            guard let rawModes = CGDisplayCopyAllDisplayModes(id, Self.allDisplayModeOptions) as? [CGDisplayMode],
                  !rawModes.isEmpty else { continue }

            var liveByID: [Int32: CGDisplayMode] = [:]
            var descriptors: [DisplayModesSupport.ModeDescriptor] = []
            for mode in rawModes {
                let descriptor = Self.descriptor(for: mode)
                if liveByID[descriptor.ioModeID] == nil { liveByID[descriptor.ioModeID] = mode }
                descriptors.append(descriptor)
            }
            modesByDisplay[id] = liveByID

            let deduped = DisplayModesSupport.sorted(DisplayModesSupport.deduplicated(descriptors))
            let options = deduped.map {
                DisplayModeOption(id: $0.ioModeID, width: $0.width, height: $0.height,
                                  pixelWidth: $0.pixelWidth, pixelHeight: $0.pixelHeight,
                                  refreshRate: $0.refreshRate)
            }
            guard !options.isEmpty else { continue }

            let currentModeID = CGDisplayCopyDisplayMode(id).map { Self.descriptor(for: $0).ioModeID }
            let isBuiltIn = CGDisplayIsBuiltin(id) != 0
            let name = Self.displayName(id, screenNames: screenNames)
            built.append(DisplayModesDisplay(id: id, name: name, isBuiltIn: isBuiltIn,
                                             modes: options, currentModeID: currentModeID))
        }

        liveModes = modesByDisplay
        if displays != built { displays = built }
    }

    func isDisplayPending(_ id: CGDirectDisplayID) -> Bool { pendingDisplayIDs.contains(id) }

    /// Switches one display to a resolution the last `refresh()` offered for
    /// it. The reconfiguration must run on the main thread, which is where
    /// CoreGraphics runs its own callbacks for it (mirrors the reasoning
    /// behind `BrightnessService.configureDisplay`), so a call from anywhere
    /// else is bounced there instead of refused.
    func apply(_ option: DisplayModeOption, to displayID: CGDirectDisplayID) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in self?.apply(option, to: displayID) }
            return
        }
        guard let mode = liveModes[displayID]?[option.id] else {
            lastFailedDisplayID = displayID
            return
        }
        lastFailedDisplayID = nil
        pendingDisplayIDs.insert(displayID)

        var reference: CGDisplayConfigRef?
        guard CGBeginDisplayConfiguration(&reference) == .success, let configuration = reference else {
            pendingDisplayIDs.remove(displayID)
            lastFailedDisplayID = displayID
            Self.log.error("could not begin a display configuration for display \(displayID)")
            return
        }
        guard CGConfigureDisplayWithDisplayMode(configuration, displayID, mode, nil) == .success else {
            CGCancelDisplayConfiguration(configuration)
            pendingDisplayIDs.remove(displayID)
            lastFailedDisplayID = displayID
            Self.log.error("could not configure display \(displayID) with the requested mode")
            return
        }
        // `.permanently` writes the choice into the saved display
        // configuration, the same place System Settings would, so the
        // resolution survives a restart without this app running.
        let succeeded = CGCompleteDisplayConfiguration(configuration, .permanently) == .success
        pendingDisplayIDs.remove(displayID)
        lastFailedDisplayID = succeeded ? nil : displayID
        Self.log.log("applied mode \(option.width)x\(option.height)@\(option.refreshRate) to display \(displayID): \(succeeded)")
        if succeeded { refresh() }
    }

    /// Without this option CoreGraphics hides the HiDPI (Retina) copies of
    /// each resolution, so the picker would only offer 1x modes. The name is
    /// Apple's: asking for the "duplicate low-resolution" modes is what also
    /// surfaces the matching 2x ones.
    private static let allDisplayModeOptions: CFDictionary = [
        kCGDisplayShowDuplicateLowResolutionModes: kCFBooleanTrue
    ] as CFDictionary

    private static func descriptor(for mode: CGDisplayMode) -> DisplayModesSupport.ModeDescriptor {
        // Prefer the Swift properties CoreGraphics exposes; the CGDisplayModeGet*
        // C helpers are obsoleted on current SDKs and fail the build.
        DisplayModesSupport.ModeDescriptor(
            ioModeID: mode.ioDisplayModeID,
            width: mode.width,
            height: mode.height,
            pixelWidth: mode.pixelWidth,
            pixelHeight: mode.pixelHeight,
            refreshRate: mode.refreshRate,
            usableForDesktopGUI: mode.isUsableForDesktopGUI())
    }

    /// The display names a person sees in System Settings. `NSScreen` is
    /// main thread only, but `refresh()` already runs there, unlike
    /// `BrightnessService`'s work-queue rebuild, so this is read directly.
    private static func localizedScreenNames() -> [CGDirectDisplayID: String] {
        var names: [CGDirectDisplayID: String] = [:]
        for screen in NSScreen.screens {
            guard let id = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")]
                             as? NSNumber)?.uint32Value else { continue }
            names[id] = screen.localizedName
        }
        return names
    }

    private static func displayName(_ id: CGDirectDisplayID,
                                    screenNames: [CGDirectDisplayID: String]) -> String {
        screenNames[id] ?? "Display"
    }
}
