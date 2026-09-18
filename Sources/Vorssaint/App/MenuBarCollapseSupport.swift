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
    static let collapsedSpacerLength: CGFloat = 10_000

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
        return CGRect(x: minX, y: menuBar.minY, width: width, height: menuBar.height)
    }

    static func spacerLength(collapsed: Bool, overlayCoversExtras: Bool) -> CGFloat {
        // The huge-length spacer is the classic Hidden Bar push. On newer
        // macOS the overlay is what actually hides extras, so the spacer
        // stays tiny whenever the overlay already covers the region.
        if collapsed && !overlayCoversExtras {
            return collapsedSpacerLength
        }
        return 0
    }
}
