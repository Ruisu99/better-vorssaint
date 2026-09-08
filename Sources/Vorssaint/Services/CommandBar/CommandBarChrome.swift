// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

/// Spotlight-like chrome for the Command Bar. One glass surface, a short
/// fade, and no per-keystroke animation: the list already rebuilds on every
/// letter, and animating that would cost more than it looks.
enum CommandBarChrome {
    static let width: CGFloat = 560
    static let cornerRadius: CGFloat = 26
    static let fieldFontSize: CGFloat = 18
    static let appearDuration: TimeInterval = 0.22
    static let disappearDuration: TimeInterval = 0.16
    static let expandDuration: TimeInterval = 0.14
    /// How far the bar rises into place on open (points). Spotlight does the
    /// same quiet lift; Reduce Motion skips it with the fade.
    static let appearLift: CGFloat = 12
    static let hairlineHeight: CGFloat = 0.5

    /// The plate over the frost. Liquid Glass already carries the blur, so
    /// the plate stays thin. Without it the plate has to do more of the
    /// contrast work. Reduce Transparency makes the material opaque, so
    /// the plate stays off.
    static func plateOpacity(liquidGlass: Bool,
                             reduceTransparency: Bool,
                             isDark: Bool) -> Double {
        guard !reduceTransparency else { return 0 }
        if liquidGlass { return isDark ? 0.18 : 0.22 }
        return isDark ? 0.42 : 0.45
    }

    static func hairlineOpacity(isDark: Bool) -> Double {
        isDark ? 0.10 : 0.07
    }

    static func edgeStrokeOpacity(isDark: Bool) -> Double {
        isDark ? 0.16 : 0.10
    }

    /// Selection in Spotlight is a quiet plate, not a coloured pill.
    static func selectionOpacity(isDark: Bool) -> Double {
        isDark ? 0.12 : 0.08
    }
}
