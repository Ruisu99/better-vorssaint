// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AppKit
import CoreGraphics
import Foundation

/// Control Center's battery is a tight horizontal body plus a nub. SF Symbol
/// `battery.100` carries huge side padding, so a percent drawn after it looks
/// like a hole, and the same glyph jammed into the square used for other
/// menu-bar symbols looks undersized. These metrics match the system lockup.
enum MenuBarBatterySupport {
    enum Scale: Equatable {
        case block(readable: Bool)
        case inline(stacked: Bool, enlarged: Bool)
    }

    private static let imageCache = NSCache<NSString, NSImage>()

    static func fillFraction(percent: Int) -> CGFloat {
        CGFloat(max(0, min(100, percent))) / 100
    }

    static func percentGap(readable: Bool) -> CGFloat {
        readable ? 3 : 2.5
    }

    static func glyphSize(scale: Scale) -> CGSize {
        let metrics = glyphMetrics(scale)
        return CGSize(width: metrics.body.width + metrics.terminalGap + metrics.terminal.width,
                      height: metrics.body.height + metrics.paddingY * 2)
    }

    static func blockWidth(percentTextWidth: CGFloat, readable: Bool) -> CGFloat {
        ceil(glyphSize(scale: .block(readable: readable)).width
             + percentGap(readable: readable)
             + percentTextWidth)
    }

    static func glyphImage(percent: Int, isCharging: Bool, scale: Scale) -> NSImage {
        let clamped = max(0, min(100, percent))
        let key = "glyph|\(clamped)|\(isCharging)|\(scaleCacheKey(scale))" as NSString
        if let cached = imageCache.object(forKey: key) { return cached }
        let size = glyphSize(scale: scale)
        let image = NSImage(size: size, flipped: false) { rect in
            NSColor.clear.setFill()
            rect.fill()
            drawGlyph(in: rect, percent: clamped, isCharging: isCharging, scale: scale)
            return true
        }
        image.isTemplate = true
        imageCache.setObject(image, forKey: key)
        return image
    }

    static func blockImage(percent: Int,
                           isCharging: Bool,
                           percentText: String,
                           reservedPercentText: String,
                           font: NSFont,
                           readable: Bool) -> NSImage {
        let clamped = max(0, min(100, percent))
        let key = "block|\(clamped)|\(isCharging)|\(percentText)|\(reservedPercentText)|\(readable)|\(font.pointSize)" as NSString
        if let cached = imageCache.object(forKey: key) { return cached }

        let scale = Scale.block(readable: readable)
        let glyph = glyphSize(scale: scale)
        let gap = percentGap(readable: readable)
        let sizingAttrs: [NSAttributedString.Key: Any] = [.font: font]
        let valueSize = (percentText as NSString).size(withAttributes: sizingAttrs)
        let reservedWidth = max(valueSize.width,
                                (reservedPercentText as NSString).size(withAttributes: sizingAttrs).width)
        let height = readable ? 22.0 : 20.0
        let imageSize = NSSize(width: ceil(glyph.width + gap + reservedWidth), height: height)
        let image = NSImage(size: imageSize, flipped: false) { rect in
            NSColor.clear.setFill()
            rect.fill()
            let glyphRect = NSRect(x: 0,
                                   y: (height - glyph.height) / 2,
                                   width: glyph.width,
                                   height: glyph.height)
            drawGlyph(in: glyphRect, percent: clamped, isCharging: isCharging, scale: scale)
            let attrs: [NSAttributedString.Key: Any] = [
                .font: font,
                .foregroundColor: NSColor.labelColor,
            ]
            let valueY = (height - valueSize.height) / 2
            (percentText as NSString).draw(at: NSPoint(x: glyph.width + gap, y: valueY),
                                           withAttributes: attrs)
            return true
        }
        image.isTemplate = false
        imageCache.setObject(image, forKey: key)
        return image
    }

    // MARK: - Drawing

    private struct GlyphMetrics {
        var body: CGSize
        var terminal: CGSize
        var terminalGap: CGFloat
        var paddingY: CGFloat
        var cornerRadius: CGFloat
        var lineWidth: CGFloat
        var fillInset: CGFloat
    }

    private static func glyphMetrics(_ scale: Scale) -> GlyphMetrics {
        switch scale {
        case let .block(readable):
            if readable {
                return GlyphMetrics(body: CGSize(width: 22, height: 9),
                                    terminal: CGSize(width: 1.6, height: 4.2),
                                    terminalGap: 0.8,
                                    paddingY: 1.5,
                                    cornerRadius: 2.2,
                                    lineWidth: 1.15,
                                    fillInset: 1.35)
            }
            return GlyphMetrics(body: CGSize(width: 20, height: 8),
                                terminal: CGSize(width: 1.5, height: 3.8),
                                terminalGap: 0.8,
                                paddingY: 1.5,
                                cornerRadius: 2.0,
                                lineWidth: 1.1,
                                fillInset: 1.25)
        case let .inline(stacked, enlarged):
            if enlarged {
                return GlyphMetrics(body: CGSize(width: 18, height: 7.5),
                                    terminal: CGSize(width: 1.4, height: 3.5),
                                    terminalGap: 0.7,
                                    paddingY: 1.2,
                                    cornerRadius: 1.9,
                                    lineWidth: 1.1,
                                    fillInset: 1.2)
            }
            if stacked {
                return GlyphMetrics(body: CGSize(width: 12, height: 5),
                                    terminal: CGSize(width: 1.1, height: 2.4),
                                    terminalGap: 0.55,
                                    paddingY: 0.8,
                                    cornerRadius: 1.3,
                                    lineWidth: 0.9,
                                    fillInset: 0.95)
            }
            return GlyphMetrics(body: CGSize(width: 16, height: 6.5),
                                terminal: CGSize(width: 1.3, height: 3.1),
                                terminalGap: 0.65,
                                paddingY: 1.1,
                                cornerRadius: 1.7,
                                lineWidth: 1.05,
                                fillInset: 1.1)
        }
    }

    private static func scaleCacheKey(_ scale: Scale) -> String {
        switch scale {
        case let .block(readable):
            return readable ? "block-readable" : "block-dense"
        case let .inline(stacked, enlarged):
            return "inline-\(stacked ? "stacked" : "single")-\(enlarged ? "large" : "normal")"
        }
    }

    private static func drawGlyph(in rect: NSRect, percent: Int, isCharging: Bool, scale: Scale) {
        let metrics = glyphMetrics(scale)
        let bodyRect = NSRect(x: rect.minX + metrics.lineWidth / 2,
                              y: rect.minY + (rect.height - metrics.body.height) / 2,
                              width: metrics.body.width - metrics.lineWidth,
                              height: metrics.body.height)
        let terminalRect = NSRect(x: bodyRect.maxX + metrics.terminalGap,
                                  y: bodyRect.midY - metrics.terminal.height / 2,
                                  width: metrics.terminal.width,
                                  height: metrics.terminal.height)

        NSColor.labelColor.setStroke()
        NSColor.labelColor.setFill()

        let outline = NSBezierPath(roundedRect: bodyRect,
                                   xRadius: metrics.cornerRadius,
                                   yRadius: metrics.cornerRadius)
        outline.lineWidth = metrics.lineWidth
        outline.stroke()

        let nub = NSBezierPath(roundedRect: terminalRect,
                               xRadius: metrics.terminal.width / 2,
                               yRadius: metrics.terminal.width / 2)
        nub.fill()

        let fraction = fillFraction(percent: percent)
        if fraction > 0 {
            let inset = metrics.fillInset
            let inner = bodyRect.insetBy(dx: inset, dy: inset)
            if inner.width > 0, inner.height > 0 {
                let fillWidth = max(1.6, inner.width * fraction)
                let fillRect = NSRect(x: inner.minX,
                                      y: inner.minY,
                                      width: min(inner.width, fillWidth),
                                      height: inner.height)
                NSBezierPath(roundedRect: fillRect, xRadius: 0.8, yRadius: 0.8).fill()
            }
        }

        if isCharging {
            drawBolt(in: bodyRect, scale: scale)
        }
    }

    private static func drawBolt(in body: NSRect, scale: Scale) {
        let metrics = glyphMetrics(scale)
        let inset = max(1.2, metrics.fillInset + 0.4)
        let boltBounds = body.insetBy(dx: inset + 0.6, dy: inset - 0.2)
        guard boltBounds.width > 3, boltBounds.height > 3 else { return }

        let path = NSBezierPath()
        path.move(to: NSPoint(x: boltBounds.midX + boltBounds.width * 0.08, y: boltBounds.maxY))
        path.line(to: NSPoint(x: boltBounds.minX, y: boltBounds.midY + boltBounds.height * 0.06))
        path.line(to: NSPoint(x: boltBounds.midX - boltBounds.width * 0.04, y: boltBounds.midY + boltBounds.height * 0.06))
        path.line(to: NSPoint(x: boltBounds.midX - boltBounds.width * 0.08, y: boltBounds.minY))
        path.line(to: NSPoint(x: boltBounds.maxX, y: boltBounds.midY - boltBounds.height * 0.06))
        path.line(to: NSPoint(x: boltBounds.midX + boltBounds.width * 0.04, y: boltBounds.midY - boltBounds.height * 0.06))
        path.close()

        // Punch the bolt out of the fill so it stays readable on a full charge,
        // then stroke it so an empty body still shows the charging mark.
        if let context = NSGraphicsContext.current?.cgContext {
            context.saveGState()
            context.setBlendMode(.destinationOut)
            NSColor.black.setFill()
            path.fill()
            context.restoreGState()
        }

        NSColor.labelColor.setStroke()
        path.lineWidth = max(0.7, metrics.lineWidth - 0.3)
        path.lineJoinStyle = .round
        path.stroke()
    }
}
