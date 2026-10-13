// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AppKit
import ImageIO
import UniformTypeIdentifiers

/// Save and OCR for images sitting in clipboard history. Recognition reuses
/// the on-device Vision path from the screen text tool, so a screenshot in
/// the history does not need Screen Recording a second time.
enum ClipboardImageActions {
    private static var recognitionGeneration = 0

    static func saveToDownloads(_ entry: ClipboardHistoryEntry) {
        guard let payload = loadPayload(entry),
              let downloads = downloadsDirectory()
        else {
            failSave()
            return
        }
        let strings = FeatureStrings.clipboard(L10n.shared.language)
        let preferred = ClipboardImageExport.preferredFileName(
            prefix: strings.savedImagePrefix,
            date: Date(),
            source: payload.source)
        let manager = FileManager.default
        let destination = ClipboardImageExport.uniqueURL(in: downloads, preferredName: preferred) { name in
            manager.fileExists(atPath: downloads.appendingPathComponent(name).path)
        }
        write(payload, to: destination, hud: strings.savedToDownloads)
    }

    static func saveAs(_ entry: ClipboardHistoryEntry) {
        guard let payload = loadPayload(entry) else {
            failSave()
            return
        }
        let strings = FeatureStrings.clipboard(L10n.shared.language)
        let preferred = ClipboardImageExport.preferredFileName(
            prefix: strings.savedImagePrefix,
            date: Date(),
            source: payload.source)
        let panel = NSSavePanel()
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.nameFieldStringValue = preferred
        if let type = UTType(filenameExtension: (preferred as NSString).pathExtension) {
            panel.allowedContentTypes = [type]
        }
        NSApp.activate(ignoringOtherApps: true)
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            write(payload, to: url, hud: nil)
        }
    }

    static func extractText(_ entry: ClipboardHistoryEntry) {
        guard let image = cgImage(from: entry) else {
            QuickToolHUD.show(icon: "text.viewfinder", message: L10n.shared.s.ocrNoText)
            return
        }
        recognitionGeneration &+= 1
        let generation = recognitionGeneration
        let detectQRCodes = UserDefaults.standard.bool(forKey: DefaultsKey.screenOCRDetectQRCodes)
        let removeLineBreaks = UserDefaults.standard.bool(forKey: DefaultsKey.screenOCRRemoveLineBreaks)
        let fallbackLanguages = MediaSupport.recognitionLanguages(for: L10n.shared.language.rawValue)
        DispatchQueue.global(qos: .userInitiated).async {
            let outcome = ScreenTextService.outcome(for: image,
                                                     detectQRCodes: detectQRCodes,
                                                     removeLineBreaks: removeLineBreaks,
                                                     fallbackLanguages: fallbackLanguages,
                                                     preferTextOverCodes: true)
            DispatchQueue.main.async {
                guard recognitionGeneration == generation else { return }
                apply(outcome)
            }
        }
    }

    // MARK: - Write

    private enum Payload {
        case data(Data, source: ClipboardImageExport.Source)
        case file(URL, source: ClipboardImageExport.Source)

        var source: ClipboardImageExport.Source {
            switch self {
            case .data(_, let source), .file(_, let source): return source
            }
        }
    }

    private static func loadPayload(_ entry: ClipboardHistoryEntry) -> Payload? {
        guard let source = ClipboardImageExport.source(for: entry) else { return nil }
        switch source {
        case .storedPNG(let name):
            guard let data = ClipboardImageStore.imageData(named: name), !data.isEmpty else { return nil }
            return .data(data, source: source)
        case .file(let path):
            let url = URL(fileURLWithPath: path)
            guard FileManager.default.fileExists(atPath: path) else { return nil }
            return .file(url, source: source)
        }
    }

    private static func downloadsDirectory() -> URL? {
        let manager = FileManager.default
        guard let downloads = manager.urls(for: .downloadsDirectory, in: .userDomainMask).first
        else { return nil }
        if !manager.fileExists(atPath: downloads.path) {
            try? manager.createDirectory(at: downloads, withIntermediateDirectories: true)
        }
        return downloads
    }

    private static func write(_ payload: Payload, to url: URL, hud: String?) {
        do {
            switch payload {
            case .data(let data, _):
                try data.write(to: url, options: .atomic)
            case .file(let source, _):
                if source.standardizedFileURL == url.standardizedFileURL { return }
                if FileManager.default.fileExists(atPath: url.path) {
                    try FileManager.default.removeItem(at: url)
                }
                try FileManager.default.copyItem(at: source, to: url)
            }
            if let hud {
                QuickToolHUD.show(icon: "square.and.arrow.down", message: hud)
            }
        } catch {
            failSave()
        }
    }

    private static func failSave() {
        NSSound.beep()
        QuickToolHUD.show(icon: "square.and.arrow.down",
                          message: FeatureStrings.clipboard(L10n.shared.language).saveFailed)
    }

    // MARK: - OCR

    private static func apply(_ outcome: ScreenTextService.Outcome) {
        let strings = L10n.shared.s
        switch outcome {
        case .qr(let reading):
            copyToPasteboard(reading.payload)
            QuickToolHUD.show(icon: "text.viewfinder", message: strings.ocrCopied)
        case .text(let text):
            copyToPasteboard(text)
            QuickToolHUD.show(icon: "text.viewfinder", message: strings.ocrCopied)
        case .empty:
            QuickToolHUD.show(icon: "text.viewfinder", message: strings.ocrNoText)
        }
    }

    private static func copyToPasteboard(_ value: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(value, forType: .string)
    }

    private static func cgImage(from entry: ClipboardHistoryEntry) -> CGImage? {
        guard let source = ClipboardImageExport.source(for: entry) else { return nil }
        switch source {
        case .storedPNG(let name):
            guard let data = ClipboardImageStore.imageData(named: name) else { return nil }
            return cgImage(from: data)
        case .file(let path):
            return cgImage(atPath: path)
        }
    }

    private static func cgImage(from data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    private static func cgImage(atPath path: String) -> CGImage? {
        let url = URL(fileURLWithPath: path) as CFURL
        guard let source = CGImageSourceCreateWithURL(url, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }
}
