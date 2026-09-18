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
    private var spacerItem: NSStatusItem?
    private var overlay: NSPanel?
    private var collapsed = true
    private var refreshTimer: Timer?
    private var observers: [NSObjectProtocol] = []
    private static let chevronAutosaveName = "VorssaintMenuBarCollapseChevron"
    private static let spacerAutosaveName = "VorssaintMenuBarCollapseSpacer"

    private init() {}

    func syncWithPreferences() {
        let enabled = AppFeature.menuBarCollapse.isAvailable
        if enabled {
            installIfNeeded()
            collapsed = UserDefaults.standard.object(forKey: DefaultsKey.menuBarExtrasCollapsed) as? Bool ?? true
            applyAppearance()
            startObserving()
            refreshOverlay()
        } else {
            tearDown()
        }
    }

    func containsItem(at screenPoint: NSPoint) -> Bool {
        if let overlay, overlay.isVisible, overlay.frame.insetBy(dx: -2, dy: -8).contains(screenPoint) {
            return true
        }
        let buttons = [chevronItem?.button, spacerItem?.button].compactMap { $0 }
        return buttons.contains { button in
            guard let frame = resolvedButtonFrame(button), frame.width > 0, frame.height > 0 else { return false }
            return frame.insetBy(dx: -4, dy: -8).contains(screenPoint)
        }
    }

    private func installIfNeeded() {
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
        if spacerItem == nil {
            let item = NSStatusBar.system.statusItem(withLength: 0)
            item.autosaveName = Self.spacerAutosaveName
            item.behavior = []
            item.isVisible = true
            if let button = item.button {
                button.image = nil
                button.title = ""
                button.appearsDisabled = true
            }
            spacerItem = item
        }
    }

    private func tearDown() {
        stopObserving()
        hideOverlay()
        overlay?.close()
        overlay = nil
        if let spacerItem { NSStatusBar.system.removeStatusItem(spacerItem) }
        if let chevronItem { NSStatusBar.system.removeStatusItem(chevronItem) }
        spacerItem = nil
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
            spacerItem?.length = 0
            return
        }
        guard let geometry = currentGeometry() else {
            hideOverlay()
            spacerItem?.length = collapsed ? MenuBarCollapseSupport.collapsedSpacerLength : 0
            return
        }
        let frame = MenuBarCollapseSupport.overlayFrame(menuBar: geometry.menuBar,
                                                        extrasMinX: geometry.extrasMinX,
                                                        chevronMinX: geometry.chevronMinX,
                                                        collapsed: collapsed)
        spacerItem?.length = MenuBarCollapseSupport.spacerLength(collapsed: collapsed,
                                                                 overlayCoversExtras: frame != nil)
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
        let extrasMinX = MenuBarCollapseSupport.overlayLeadingX(menuBar: menuBar,
                                                                notchRightMinX: notchRight,
                                                                extraMinXs: extraMinXs)
        return Geometry(menuBar: menuBar, extrasMinX: extrasMinX, chevronMinX: chevron.minX)
    }

    /// macOS 27 can park a status item's AppKit frame at the slot it was born
    /// in. The window server still knows where the icon is actually drawn, so
    /// the overlay and hit testing ask it when the reported frame is lying.
    private func resolvedButtonFrame(_ button: NSStatusBarButton) -> CGRect? {
        guard let window = button.window else { return nil }
        let reported = window.convertToScreen(button.convert(button.bounds, to: nil))
        if StatusItemAnchorSupport.isTrustworthyStatusFrame(window.frame) {
            return reported
        }
        return serverFrame(windowNumber: window.windowNumber) ?? reported
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
        let statusLevel = Int(CGWindowLevelForKey(.statusWindow))
        let overlayNumber = overlay?.windowNumber
        guard let mainHeight = mainDisplayHeight, mainHeight > 0 else { return [] }
        return WindowServerSupport.onScreenWindowInfo().compactMap { info in
            guard let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue,
                  layer == statusLevel,
                  let number = (info[kCGWindowNumber as String] as? NSNumber)?.intValue,
                  number != windowNumber,
                  number != overlayNumber,
                  let quartz = WindowServerSupport.bounds(from: info)
            else { return nil }
            let cocoa = MenuBarCollapseSupport.cocoaFrame(fromQuartz: quartz, mainDisplayHeight: mainHeight)
            guard cocoa.minX < chevronMinX - 1,
                  cocoa.maxY >= menuBar.minY,
                  cocoa.minY <= menuBar.maxY,
                  cocoa.height <= 48,
                  cocoa.width > 0
            else { return nil }
            return cocoa.minX
        }
    }

    private func showOverlay(_ frame: CGRect) {
        if overlay == nil {
            let panel = NSPanel(contentRect: frame,
                                styleMask: [.borderless, .nonactivatingPanel],
                                backing: .buffered,
                                defer: false)
            panel.isReleasedWhenClosed = false
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.hasShadow = false
            panel.hidesOnDeactivate = false
            panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.statusWindow)) + 1)
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
            panel.ignoresMouseEvents = false
            let effect = NSVisualEffectView(frame: panel.contentView?.bounds ?? .zero)
            effect.autoresizingMask = [.width, .height]
            effect.material = .menu
            effect.blendingMode = .behindWindow
            effect.state = .active
            panel.contentView = effect
            let click = NSClickGestureRecognizer(target: self, action: #selector(overlayClicked))
            effect.addGestureRecognizer(click)
            overlay = panel
        }
        overlay?.setFrame(frame, display: true)
        overlay?.orderFrontRegardless()
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
