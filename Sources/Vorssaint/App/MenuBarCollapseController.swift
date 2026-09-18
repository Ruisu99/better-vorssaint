// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AppKit
import CoreGraphics

/// Hidden Bar-style extras collapse for the menu bar, including macOS 27
/// where expanding an NSStatusItem length no longer pushes other extras off
/// screen. The chevron is a normal status item the user Command-drags; icons
/// to its left hide when collapsed, icons to its right stay visible.
final class MenuBarCollapseController {
    static let shared = MenuBarCollapseController()

    private var chevronItem: NSStatusItem?
    private var overlay: NSPanel?
    private var collapsed = false
    private var refreshTimer: Timer?
    private var observers: [NSObjectProtocol] = []
    private var installScheduled = false
    private static let chevronAutosaveName = "VorssaintMenuBarCollapseChevron"
    private static let retiredSpacerAutosaveName = "VorssaintMenuBarCollapseSpacer"

    private init() {}

    func syncWithPreferences() {
        let enabled = AppFeature.menuBarCollapse.isAvailable
        if enabled {
            // Status items created in the middle of applicationDidFinishLaunching
            // often have no window yet. A 10_000pt spacer or a lying overlay at
            // that moment is what made the app look like it never started.
            guard !installScheduled else { return }
            installScheduled = true
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.installScheduled = false
                guard AppFeature.menuBarCollapse.isAvailable else {
                    self.tearDown()
                    return
                }
                self.installIfNeeded()
                self.collapsed = UserDefaults.standard.object(forKey: DefaultsKey.menuBarExtrasCollapsed) as? Bool ?? false
                self.applyAppearance()
                self.startObserving()
                self.refreshOverlay()
            }
        } else {
            installScheduled = false
            tearDown()
        }
    }

    func containsItem(at screenPoint: NSPoint) -> Bool {
        if let overlay, overlay.isVisible, overlay.frame.insetBy(dx: -2, dy: -8).contains(screenPoint) {
            return true
        }
        guard let button = chevronItem?.button,
              let frame = resolvedButtonFrame(button),
              frame.width > 0, frame.height > 0 else { return false }
        return frame.insetBy(dx: -4, dy: -8).contains(screenPoint)
    }

    private func installIfNeeded() {
        retireLegacySpacer()
        if chevronItem == nil {
            let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
            item.autosaveName = Self.chevronAutosaveName
            item.behavior = []
            item.isVisible = true
            if let button = item.button {
                button.target = self
                button.action = #selector(chevronClicked)
                button.sendAction(on: [.leftMouseUp])
                button.imagePosition = .imageOnly
            }
            chevronItem = item
        }
    }

    /// A previous build persisted a 10_000pt spacer under this name. Creating
    /// that item again would restore the length and stall the menu bar, so
    /// only the remembered placement keys are dropped.
    private func retireLegacySpacer() {
        let defaults = UserDefaults.standard
        let name = Self.retiredSpacerAutosaveName
        defaults.removeObject(forKey: "NSStatusItem Visible \(name)")
        defaults.removeObject(forKey: "NSStatusItem VisibleCC \(name)")
        defaults.removeObject(forKey: "NSStatusItem Preferred Position \(name)")
    }

    private func tearDown() {
        stopObserving()
        hideOverlay()
        overlay?.close()
        overlay = nil
        if let chevronItem { NSStatusBar.system.removeStatusItem(chevronItem) }
        chevronItem = nil
    }

    private func startObserving() {
        stopObserving()
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
                                            object: nil, queue: .main) { [weak self] _ in
            self?.refreshOverlay()
        })
        observers.append(center.addObserver(forName: NSWorkspace.activeSpaceDidChangeNotification,
                                            object: nil, queue: .main) { [weak self] _ in
            self?.refreshOverlay()
        })
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 0.45, repeats: true) { [weak self] _ in
            self?.refreshOverlay()
        }
        refreshTimer?.tolerance = 0.15
    }

    private func stopObserving() {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
        refreshTimer?.invalidate()
        refreshTimer = nil
    }

    @objc private func chevronClicked() {
        PanelInteractionState.shared.consumeDismissClick()
        collapsed.toggle()
        UserDefaults.standard.set(collapsed, forKey: DefaultsKey.menuBarExtrasCollapsed)
        applyAppearance()
        refreshOverlay()
    }

    private func applyAppearance() {
        let strings = FeatureStrings.menuBarCollapse(L10n.shared.language)
        chevronItem?.button?.image = chevronImage()
        chevronItem?.button?.toolTip = collapsed ? strings.tooltipCollapsed : strings.tooltipExpanded
        chevronItem?.button?.image?.isTemplate = true
    }

    private func chevronImage() -> NSImage? {
        let name = collapsed ? "chevron.left" : "chevron.right"
        let image = NSImage(systemSymbolName: name, accessibilityDescription: nil)
        image?.isTemplate = true
        return image
    }

    private func refreshOverlay() {
        guard AppFeature.menuBarCollapse.isAvailable, let chevronItem, chevronItem.isVisible else {
            hideOverlay()
            return
        }
        guard collapsed, let geometry = currentGeometry() else {
            hideOverlay()
            return
        }
        let frame = MenuBarCollapseSupport.overlayFrame(menuBar: geometry.menuBar,
                                                        extrasMinX: geometry.extrasMinX,
                                                        chevronMinX: geometry.chevronMinX,
                                                        collapsed: true)
        if let frame {
            showOverlay(frame)
        } else {
            hideOverlay()
        }
    }

    private struct Geometry {
        var menuBar: CGRect
        var extrasMinX: CGFloat
        var chevronMinX: CGFloat
    }

    private func currentGeometry() -> Geometry? {
        guard let button = chevronItem?.button,
              let window = button.window,
              let chevron = resolvedButtonFrame(button) else { return nil }
        let screen = window.screen ?? NSScreen.withMenuBar
        guard let screen else { return nil }
        let barHeight = max(screen.frame.maxY - screen.visibleFrame.maxY, 22)
        let menuBar = CGRect(x: screen.frame.minX,
                             y: screen.frame.maxY - barHeight,
                             width: screen.frame.width,
                             height: barHeight)
        let notchRight = screen.auxiliaryTopRightArea?.minX
        let extraMinXs = statusItemMinXs(leftOf: chevron.minX,
                                         excluding: window.windowNumber,
                                         menuBar: menuBar)
        var extrasMinX = MenuBarCollapseSupport.overlayLeadingX(menuBar: menuBar,
                                                                notchRightMinX: notchRight,
                                                                extraMinXs: extraMinXs)
        var chevronMinX = chevron.minX
        if let keepVisible = ownKeepVisibleMinX(excluding: window.windowNumber, menuBar: menuBar) {
            chevronMinX = min(chevronMinX, keepVisible)
        }
        extrasMinX = min(extrasMinX, chevronMinX)
        return Geometry(menuBar: menuBar, extrasMinX: extrasMinX, chevronMinX: chevronMinX)
    }

    /// macOS 27 can park a status item's AppKit frame at the slot it was born
    /// in. The window server still knows where the icon is actually drawn, so
    /// the overlay and hit testing ask it when the reported frame is lying.
    /// A lying frame is never used: that is how an overlay covered the icon
    /// and made a launch look like a failure.
    private func resolvedButtonFrame(_ button: NSStatusBarButton) -> CGRect? {
        guard let window = button.window else { return nil }
        let reported = window.convertToScreen(button.convert(button.bounds, to: nil))
        let candidate: CGRect
        if StatusItemAnchorSupport.isTrustworthyStatusFrame(window.frame) {
            candidate = reported
        } else if let server = serverFrame(windowNumber: window.windowNumber),
                  StatusItemAnchorSupport.isTrustworthyStatusFrame(server) {
            candidate = server
        } else {
            return nil
        }
        guard StatusItemAnchorSupport.isTrustworthyStatusFrame(candidate) else { return nil }
        return candidate
    }

    private func serverFrame(windowNumber: Int) -> CGRect? {
        let id = CGWindowID(windowNumber)
        guard let infos = CGWindowListCopyWindowInfo([.optionIncludingWindow], id) as? [[String: Any]],
              let info = infos.first,
              let quartz = WindowServerSupport.bounds(from: info),
              let mainHeight = mainDisplayHeight, mainHeight > 0 else { return nil }
        return MenuBarCollapseSupport.cocoaFrame(fromQuartz: quartz, mainDisplayHeight: mainHeight)
    }

    private var mainDisplayHeight: CGFloat? {
        NSScreen.screens.first(where: { $0.frame.minX == 0 && $0.frame.minY == 0 })?.frame.height
            ?? NSScreen.main?.frame.height
    }

    private func statusItemMinXs(leftOf chevronMinX: CGFloat,
                                 excluding windowNumber: Int,
                                 menuBar: CGRect) -> [CGFloat] {
        statusWindows(in: menuBar, excluding: windowNumber)
            .compactMap { cocoa in
                guard cocoa.minX < chevronMinX - 1 else { return nil }
                return cocoa.minX
            }
    }

    private func ownKeepVisibleMinX(excluding windowNumber: Int, menuBar: CGRect) -> CGFloat? {
        let pid = ProcessInfo.processInfo.processIdentifier
        let overlayNumber = overlay?.windowNumber
        return WindowServerSupport.onScreenWindowInfo().compactMap { info -> CGFloat? in
            guard let owner = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value,
                  owner == pid,
                  let number = (info[kCGWindowNumber as String] as? NSNumber)?.intValue,
                  number != windowNumber,
                  number != overlayNumber,
                  let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue,
                  layer == Int(CGWindowLevelForKey(.statusWindow)),
                  let cocoa = cocoaStatusFrame(from: info, menuBar: menuBar)
            else { return nil }
            return cocoa.minX
        }.min()
    }

    private func statusWindows(in menuBar: CGRect, excluding windowNumber: Int) -> [CGRect] {
        let statusLevel = Int(CGWindowLevelForKey(.statusWindow))
        let overlayNumber = overlay?.windowNumber
        return WindowServerSupport.onScreenWindowInfo().compactMap { info in
            guard let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue,
                  layer == statusLevel,
                  let number = (info[kCGWindowNumber as String] as? NSNumber)?.intValue,
                  number != windowNumber,
                  number != overlayNumber,
                  let cocoa = cocoaStatusFrame(from: info, menuBar: menuBar)
            else { return nil }
            return cocoa
        }
    }

    private func cocoaStatusFrame(from info: [String: Any], menuBar: CGRect) -> CGRect? {
        guard let quartz = WindowServerSupport.bounds(from: info),
              let mainHeight = mainDisplayHeight, mainHeight > 0 else { return nil }
        let cocoa = MenuBarCollapseSupport.cocoaFrame(fromQuartz: quartz, mainDisplayHeight: mainHeight)
        guard cocoa.maxY >= menuBar.minY,
              cocoa.minY <= menuBar.maxY,
              cocoa.height <= 48,
              cocoa.width > 0
        else { return nil }
        return cocoa
    }

    private func showOverlay(_ frame: CGRect) {
        if overlay == nil {
            let panel = NSPanel(contentRect: frame,
                                styleMask: [.borderless, .nonactivatingPanel],
                                backing: .buffered,
                                defer: false)
            panel.isReleasedWhenClosed = false
            // Opaque so extras cannot shine through. A clear panel with
            // behind-window menu material sampled the wallpaper without the
            // menu bar's darkening and read as a coloured slab.
            panel.isOpaque = true
            panel.backgroundColor = .windowBackgroundColor
            panel.hasShadow = false
            panel.hidesOnDeactivate = false
            panel.animationBehavior = .none
            panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.statusWindow)) + 1)
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
            panel.ignoresMouseEvents = false
            let view = MenuBarCollapseOverlayView(frame: NSRect(origin: .zero, size: frame.size))
            let click = NSClickGestureRecognizer(target: self, action: #selector(overlayClicked))
            view.addGestureRecognizer(click)
            panel.contentView = view
            overlay = panel
        }
        overlay?.setFrame(frame, display: true)
        applyOverlayFill(frame)
        overlay?.orderFrontRegardless()
    }

    private func applyOverlayFill(_ frame: CGRect) {
        guard let panel = overlay,
              let view = panel.contentView as? MenuBarCollapseOverlayView else { return }
        let screen = panel.screen
            ?? NSScreen.screens.first { $0.frame.intersects(frame) }
            ?? NSScreen.withMenuBar
        guard let screen else {
            view.apply(image: nil, alreadyMatchesMenuBar: false)
            return
        }
        panel.appearance = NSApp.effectiveAppearance
        if let wallpaper = captureWindowImage(layer: Int(CGWindowLevelForKey(.desktopWindow)),
                                              overlay: frame,
                                              screen: screen,
                                              ownerNames: ["Wallpaper", "Dock"])
            ?? cropDesktopFile(overlay: frame, screen: screen) {
            view.apply(image: wallpaper, alreadyMatchesMenuBar: false)
            return
        }
        view.apply(image: nil, alreadyMatchesMenuBar: false)
    }

    private func captureWindowImage(layer: Int,
                                    overlay: CGRect,
                                    screen: NSScreen,
                                    ownerNames: Set<String>?) -> NSImage? {
        guard let mainHeight = mainDisplayHeight, mainHeight > 0 else { return nil }
        let quartz = MenuBarCollapseSupport.quartzRect(fromCocoa: overlay, mainDisplayHeight: mainHeight)
        guard quartz.width >= 1, quartz.height >= 1 else { return nil }
        let infos = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
        for info in infos {
            guard let windowLayer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue,
                  windowLayer == layer,
                  let number = (info[kCGWindowNumber as String] as? NSNumber)?.uint32Value,
                  number != CGWindowID(self.overlay?.windowNumber ?? 0),
                  let bounds = WindowServerSupport.bounds(from: info)
            else { continue }
            if let ownerNames {
                let owner = info[kCGWindowOwnerName as String] as? String ?? ""
                guard ownerNames.contains(owner) else { continue }
            }
            let cocoa = MenuBarCollapseSupport.cocoaFrame(fromQuartz: bounds, mainDisplayHeight: mainHeight)
            guard cocoa.intersects(overlay.insetBy(dx: -2, dy: -2)),
                  cocoa.intersects(screen.frame)
            else { continue }
            guard let image = CGWindowListCreateImage(quartz,
                                                       [.optionIncludingWindow],
                                                       number,
                                                       [.bestResolution, .boundsIgnoreFraming]),
                  image.width > 8, image.height > 2
            else { continue }
            return NSImage(cgImage: image, size: overlay.size)
        }
        return nil
    }

    private func cropDesktopFile(overlay: CGRect, screen: NSScreen) -> NSImage? {
        guard let url = NSWorkspace.shared.desktopImageURL(for: screen),
              let source = NSImage(contentsOf: url),
              let cg = source.cgImage(forProposedRect: nil, context: nil, hints: nil)
        else { return nil }
        let imageSize = CGSize(width: cg.width, height: cg.height)
        let crop = MenuBarCollapseSupport.wallpaperCrop(imageSize: imageSize,
                                                        overlay: overlay,
                                                        screen: screen.frame).integral
        guard crop.width >= 1, crop.height >= 1,
              let cropped = cg.cropping(to: crop)
        else { return nil }
        return NSImage(cgImage: cropped, size: overlay.size)
    }

    private func hideOverlay() {
        overlay?.orderOut(nil)
    }

    @objc private func overlayClicked() {
        PanelInteractionState.shared.consumeDismissClick()
        guard collapsed else { return }
        collapsed = false
        UserDefaults.standard.set(false, forKey: DefaultsKey.menuBarExtrasCollapsed)
        applyAppearance()
        refreshOverlay()
    }
}

/// Wallpaper (or a captured menu-bar strip) plus the titlebar material used
/// on the real bar. behind-window blending is never used: that is what made
/// the overlay look like a coloured slab sitting on the extras.
private final class MenuBarCollapseOverlayView: NSView {
    private let wallpaperLayer = CALayer()
    private let effectView = NSVisualEffectView()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.addSublayer(wallpaperLayer)
        wallpaperLayer.contentsGravity = .resize
        wallpaperLayer.frame = bounds

        effectView.frame = bounds
        effectView.autoresizingMask = [.width, .height]
        effectView.material = .titlebar
        effectView.blendingMode = .withinWindow
        effectView.state = .active
        effectView.isEmphasized = true
        addSubview(effectView)
    }

    required init?(coder: NSCoder) {
        nil
    }

    override func layout() {
        super.layout()
        wallpaperLayer.frame = bounds
        effectView.frame = bounds
    }

    func apply(image: NSImage?, alreadyMatchesMenuBar: Bool) {
        wallpaperLayer.contents = image?.cgImage(forProposedRect: nil, context: nil, hints: nil)
        effectView.isHidden = alreadyMatchesMenuBar && image != nil
    }
}
