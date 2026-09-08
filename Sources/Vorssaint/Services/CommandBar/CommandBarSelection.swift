// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AppKit
import ApplicationServices

/// What the person had selected in the app in front when the bar opened.
///
/// This is what turns the bar from a place you go to into something that acts
/// on what you are already doing: select a link and the bar offers to clean
/// it, select a paragraph and it offers to change its case, count it or keep
/// it. Nothing is read while the bar is closed, and the text never leaves the
/// Mac or reaches disk.
enum CommandBarSelectionReader {
    /// A selection longer than this is a document, not a phrase; offering to
    /// retype it would be slower than doing it by hand.
    static let maximumLength = 20_000

    /// The selected text of the app that had focus when the bar opened.
    /// Blocking, so callers run it off the main thread. Pass that app
    /// explicitly: after `makeKey()` the frontmost process can already be
    /// us, and an empty read then drops Improve writing and the rest.
    /// Empty when nothing is selected, when the app does not tell
    /// Accessibility what is selected, or when the target is us.
    static func readSelectedText(from app: NSRunningApplication? = nil) -> String {
        guard AXIsProcessTrusted() else { return "" }
        let target = resolvedTarget(app)
        guard let target, target.bundleIdentifier != Bundle.main.bundleIdentifier else { return "" }
        // Asked of the app that held the selection, not of the system-wide
        // element: a timeout set on the system-wide element is the DEFAULT
        // FOR THE WHOLE PROCESS, and every other Accessibility call in the
        // app would inherit this short leash for the rest of the session.
        let element = AXUIElementCreateApplication(target.processIdentifier)
        // A hung app must not hold the opening of the bar.
        AXUIElementSetMessagingTimeout(element, 0.35)
        if let focused = copyElement(element, kAXFocusedUIElementAttribute),
           let text = clippedSelection(copyString(focused, kAXSelectedTextAttribute)) {
            return text
        }
        // Some editors put the caret on a child that has no selected-text
        // attribute; the focused window still does.
        if let window = copyElement(element, kAXFocusedWindowAttribute),
           let text = clippedSelection(copyString(window, kAXSelectedTextAttribute)) {
            return text
        }
        return ""
    }

    private static func resolvedTarget(_ app: NSRunningApplication?) -> NSRunningApplication? {
        if let app, !app.isTerminated { return app }
        return NSWorkspace.shared.frontmostApplication
    }

    private static func clippedSelection(_ text: String?) -> String? {
        let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty, trimmed.count <= maximumLength else { return nil }
        return trimmed
    }

    // MARK: - Accessibility reading

    private static func copyElement(_ element: AXUIElement, _ attribute: String) -> AXUIElement? {
        guard let raw = copyValue(element, attribute),
              CFGetTypeID(raw) == AXUIElementGetTypeID() else { return nil }
        return (raw as! AXUIElement)
    }

    private static func copyString(_ element: AXUIElement, _ attribute: String) -> String? {
        guard let raw = copyValue(element, attribute),
              CFGetTypeID(raw) == CFStringGetTypeID() else { return nil }
        return raw as? String
    }

    private static func copyValue(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success
        else { return nil }
        return value
    }
}
