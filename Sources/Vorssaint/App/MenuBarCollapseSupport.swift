// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import CoreGraphics
import Foundation

/// Pure geometry for the Hidden Bar-style extras collapse. The overlay covers
/// the extras region to the left of the chevron without touching the Apple
/// menu, app menus, or the always-visible items to the right.
enum MenuBarCollapseSupport {
    static let minimumHiddenWidth: CGFloat = 8
    static let unnotchedExtrasStartFraction: CGFloat = 0.38
    /// Expanding an NSStatusItem to this length is the classic Hidden Bar
    /// push. On macOS 15+ it no longer hides extras, and a 10_000pt item at
    /// launch can stall the menu bar so the app looks like it never started.
    static let collapsedSpacerLength: CGFloat = 0
    /// A chevron whose reported frame sits on the far right would paint an
    /// overlay across the whole extras region, including this app's own icon.
    static let maximumHiddenFraction: CGFloat = 0.82

    static func extrasMinX(menuBar: CGRect, notchRightMinX: CGFloat?) -> CGFloat {
        if let notchRightMinX {
            return max(menuBar.minX, notchRightMinX)
        }
        return menuBar.minX + menuBar.width * unnotchedExtrasStartFraction
    }

    /// Quartz window bounds are top-left on the main display. AppKit frames
    /// are bottom-left, so an overlay placed with the raw server rectangle
    /// would land in the dock instead of the menu bar.
    static func cocoaFrame(fromQuartz rect: CGRect, mainDisplayHeight: CGFloat) -> CGRect {
        CGRect(x: rect.origin.x,
              y: mainDisplayHeight - rect.origin.y - rect.height,
              width: rect.width,
              height: rect.height)
    }

    /// Inverse of `cocoaFrame`. Window-server screenshots and desktop captures
    /// speak Quartz, so the overlay crop has to be asked for in that space.
    static func quartzRect(fromCocoa rect: CGRect, mainDisplayHeight: CGFloat) -> CGRect {
        cocoaFrame(fromQuartz: rect, mainDisplayHeight: mainDisplayHeight)
    }

    /// The portion of a wallpaper image that aspect-fills `canvasSize`.
    /// Image coordinates are top-left, matching `CGImage.cropping`.
    static func aspectFillRect(imageSize: CGSize, canvasSize: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0,
              canvasSize.width > 0, canvasSize.height > 0 else { return .zero }
        let imageAspect = imageSize.width / imageSize.height
        let canvasAspect = canvasSize.width / canvasSize.height
        if imageAspect > canvasAspect {
            let width = imageSize.height * canvasAspect
            return CGRect(x: (imageSize.width - width) / 2,
                          y: 0,
                          width: width,
                          height: imageSize.height)
        }
        let height = imageSize.width / canvasAspect
        return CGRect(x: 0,
                      y: (imageSize.height - height) / 2,
                      width: imageSize.width,
                      height: height)
    }

    /// Pixel crop of a full-screen wallpaper for the overlay band. Frames are
    /// Cocoa (bottom-left); the result is top-left in image pixels so it can
    /// be passed to `CGImage.cropping`.
    static func wallpaperCrop(imageSize: CGSize, overlay: CGRect, screen: CGRect) -> CGRect {
        let filled = aspectFillRect(imageSize: imageSize, canvasSize: screen.size)
        guard screen.width > 0, screen.height > 0,
              filled.width > 0, filled.height > 0 else { return .zero }
        let x = filled.minX + (overlay.minX - screen.minX) / screen.width * filled.width
        let y = filled.minY + (screen.maxY - overlay.maxY) / screen.height * filled.height
        let width = overlay.width / screen.width * filled.width
        let height = overlay.height / screen.height * filled.height
        return CGRect(x: x, y: y, width: width, height: height)
    }

    /// On a notched bar extras never start left of the camera housing. On an
    /// un-notched bar the actual leftmost extra wins, so the overlay does not
    /// sit on the Apple menu when the 0.38 fallback is too far left.
    static func overlayLeadingX(menuBar: CGRect,
                                notchRightMinX: CGFloat?,
                                extraMinXs: [CGFloat]) -> CGFloat {
        let floor = extrasMinX(menuBar: menuBar, notchRightMinX: notchRightMinX)
        let inBar = extraMinXs.filter { $0 >= menuBar.minX && $0 <= menuBar.maxX }
        guard let leftmost = inBar.min() else { return floor }
        if notchRightMinX != nil {
            return max(floor, leftmost)
        }
        return leftmost
    }

    static func overlayFrame(menuBar: CGRect,
                             extrasMinX: CGFloat,
                             chevronMinX: CGFloat,
                             collapsed: Bool) -> CGRect? {
        guard collapsed else { return nil }
        let minX = max(menuBar.minX, extrasMinX)
        let maxX = min(menuBar.maxX, chevronMinX)
        let width = maxX - minX
        guard width >= minimumHiddenWidth, menuBar.height > 0 else { return nil }
        guard menuBar.width <= 0 || width <= menuBar.width * maximumHiddenFraction else { return nil }
        return CGRect(x: minX, y: menuBar.minY, width: width, height: menuBar.height)
    }

    static func spacerLength(collapsed: Bool, overlayCoversExtras: Bool) -> CGFloat {
        _ = collapsed
        _ = overlayCoversExtras
        return 0
    }
}
