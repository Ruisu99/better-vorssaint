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
        AXUIElementSetMessagingTimeout(element, 0.55)
        if let text = selection(fromApplication: element) { return text }
        return ""
    }

    private static func resolvedTarget(_ app: NSRunningApplication?) -> NSRunningApplication? {
        if let app, !app.isTerminated { return app }
        return NSWorkspace.shared.frontmostApplication
    }

    private static func selection(fromApplication app: AXUIElement) -> String? {
        if let focused = copyElement(app, kAXFocusedUIElementAttribute),
           let text = selection(fromFocused: focused) {
            return text
        }
        if let window = copyElement(app, kAXFocusedWindowAttribute),
           let text = selection(fromFocused: window) {
            return text
        }
        return selection(fromFocused: app)
    }

    private static func selection(fromFocused focused: AXUIElement) -> String? {
        var current: AXUIElement? = focused
        for _ in 0..<8 {
            guard let element = current else { break }
            if let text = clippedSelection(copyString(element, kAXSelectedTextAttribute)) {
                return text
            }
            if let text = clippedSelection(stringForSelectedRange(element)) {
                return text
            }
            if let child = firstSelectedChild(of: element),
               let text = clippedSelection(copyString(child, kAXSelectedTextAttribute))
                ?? clippedSelection(stringForSelectedRange(child)) {
                return text
            }
            current = copyElement(element, kAXParentAttribute)
        }
        return nil
    }

    private static func firstSelectedChild(of element: AXUIElement) -> AXUIElement? {
        guard let children = copyElements(element, kAXChildrenAttribute) else { return nil }
        let preferred: Set<String> = [
            "AXTextArea", "AXTextField", "AXWebArea", "AXGroup", "AXScrollArea",
        ]
        for child in children.prefix(24) {
            let role = copyString(child, kAXRoleAttribute) ?? ""
            if preferred.contains(role),
               clippedSelection(copyString(child, kAXSelectedTextAttribute)) != nil
                || clippedSelection(stringForSelectedRange(child)) != nil {
                return child
            }
        }
        return children.prefix(12).first { child in
            clippedSelection(copyString(child, kAXSelectedTextAttribute)) != nil
                || clippedSelection(stringForSelectedRange(child)) != nil
        }
    }

    private static func stringForSelectedRange(_ element: AXUIElement) -> String? {
        guard let range = copyValue(element, kAXSelectedTextRangeAttribute) else { return nil }
        var selected: CFTypeRef?
        let status = AXUIElementCopyParameterizedAttributeValue(
            element,
            kAXStringForRangeParameterizedAttribute as CFString,
            range,
            &selected
        )
        guard status == .success, let selected else { return nil }
        if CFGetTypeID(selected) == CFStringGetTypeID() {
            return selected as? String
        }
        return nil
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

    private static func copyElements(_ element: AXUIElement, _ attribute: String) -> [AXUIElement]? {
        guard let raw = copyValue(element, attribute),
              CFGetTypeID(raw) == CFArrayGetTypeID() else { return nil }
        let array = raw as! NSArray
        return array.compactMap { item -> AXUIElement? in
            let object = item as AnyObject
            guard CFGetTypeID(object) == AXUIElementGetTypeID() else { return nil }
            return (object as! AXUIElement)
        }
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
