// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AppKit
import Vision

/// Screen OCR: the user picks an area on the app's own capture surface, the
/// text in it is recognized offline with Vision and lands on the clipboard.
/// Needs Screen Recording, requested contextually on first use.
///
/// The picking and the capture both happen here rather than through the
/// system's capture command. A separate command is judged by macOS on its own
/// standing, which on recent versions can be refused even while this app is
/// allowed, and a refused command writes no file and says nothing: the tool
/// looked dead with no crosshair, no message and nothing to fix (issue #364).
final class ScreenTextService: ObservableObject {
    static let shared = ScreenTextService()

    private var recognitionGeneration = 0

    private init() {}

    func syncWithPreferences() {
        guard AppFeature.screenOCR.isAvailable else {
            cancelSession()
            return
        }
    }

    func suspend() {
        cancelSession()
    }

    private func cancelSession() {
        recognitionGeneration += 1
    }

    func capture() {
        ScreenCaptureService.shared.capture(initial: .text)
    }

    func receiveUnifiedCapture(_ capture: ScreenshotSelectionController.Capture) {
        recognitionGeneration += 1
        recognize(capture.image)
    }

    /// What a captured region turned out to hold.
    enum Outcome: Equatable {
        case qr(BarcodeDetector.Reading)
        case text(String)
        case empty
    }

    private func recognize(_ image: CGImage) {
        let generation = recognitionGeneration
        let detectQRCodes = UserDefaults.standard.bool(forKey: DefaultsKey.screenOCRDetectQRCodes)
        let removeLineBreaks = UserDefaults.standard.bool(forKey: DefaultsKey.screenOCRRemoveLineBreaks)
        let fallbackLanguages = MediaSupport.recognitionLanguages(for: L10n.shared.language.rawValue)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let outcome = ScreenTextService.outcome(for: image,
                                                    detectQRCodes: detectQRCodes,
                                                    removeLineBreaks: removeLineBreaks,
                                                    fallbackLanguages: fallbackLanguages)
            DispatchQueue.main.async { [weak self] in
                guard self?.recognitionGeneration == generation else { return }
                let strings = L10n.shared.s
                switch outcome {
                case .qr(let reading):
                    // Show what the code holds instead of copying it blindly;
                    // the panel offers copy and, for a link, open.
                    QRResultController.shared.show(reading: reading)
                case .text(let text):
                    Self.copyToPasteboard(text)
                    QuickToolHUD.show(icon: "text.viewfinder", message: strings.ocrCopied)
                case .empty:
                    QuickToolHUD.show(icon: "text.viewfinder", message: strings.ocrNoText)
                }
            }
        }
    }

    /// Decides what a captured region holds. A QR code wins over the text
    /// for the screen tool: it is the thing the user pointed at, and the
    /// scan is a fast pass that falls through to text recognition when no
    /// code is found. Clipboard history prefers words first, then a code,
    /// because a screenshot of a page often contains an incidental QR.
    /// Pure enough to exercise directly on a known image.
    static func outcome(for image: CGImage,
                        detectQRCodes: Bool,
                        removeLineBreaks: Bool,
                        fallbackLanguages: [String] = ["en-US"],
                        preferTextOverCodes: Bool = false) -> Outcome {
        let prepared = preparedForRecognition(image)
        if detectQRCodes, !preferTextOverCodes, let reading = BarcodeDetector.read(prepared) {
            return .qr(reading)
        }

        var lines = recognizedLines(in: prepared,
                                    level: .accurate,
                                    automaticallyDetectLanguage: false,
                                    preferredLanguages: fallbackLanguages)
        if lines.isEmpty {
            // Auto-detect is a second chance for a language that is not the
            // UI language (a Japanese screenshot on a German Mac, for example).
            lines = recognizedLines(in: prepared,
                                    level: .accurate,
                                    automaticallyDetectLanguage: true,
                                    preferredLanguages: fallbackLanguages)
        }
        if lines.isEmpty {
            // The fast path uses a different recognition model. It is a
            // separate second chance when the accurate model returns no text.
            lines = recognizedLines(in: prepared,
                                    level: .fast,
                                    automaticallyDetectLanguage: false,
                                    preferredLanguages: fallbackLanguages)
        }
        let text = QuickToolsSupport.joinedRecognizedText(lines,
                                                         removingLineBreaks: removeLineBreaks)
        if !text.isEmpty { return .text(text) }
        if detectQRCodes, preferTextOverCodes, let reading = BarcodeDetector.read(prepared) {
            return .qr(reading)
        }
        return .empty
    }

    /// Vision reads small clipboard screenshots more reliably when the
    /// shortest side is at least ~720 px, and huge Retina captures stay
    /// bounded so recognition cannot stall the history window.
    static func preparedForRecognition(_ image: CGImage) -> CGImage {
        let width = image.width
        let height = image.height
        guard width > 0, height > 0 else { return image }
        let minSide = min(width, height)
        let maxSide = max(width, height)
        var scale = 1.0
        if minSide < 720 {
            scale = 720.0 / Double(minSide)
        }
        if Double(maxSide) * scale > 4096 {
            scale = 4096.0 / Double(maxSide)
        }
        guard abs(scale - 1) >= 0.01 else { return image }
        let newWidth = max(1, Int((Double(width) * scale).rounded()))
        let newHeight = max(1, Int((Double(height) * scale).rounded()))
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: nil,
            width: newWidth,
            height: newHeight,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return image }
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(x: 0, y: 0, width: newWidth, height: newHeight))
        return context.makeImage() ?? image
    }

    private static func recognizedLines(
        in image: CGImage,
        level: VNRequestTextRecognitionLevel,
        automaticallyDetectLanguage: Bool,
        preferredLanguages: [String] = []
    ) -> [QuickToolsSupport.RecognizedLine] {
        let request = VNRecognizeTextRequest()
        request.revision = VNRecognizeTextRequest.currentRevision
        request.recognitionLevel = level
        request.usesLanguageCorrection = true
        request.automaticallyDetectsLanguage = automaticallyDetectLanguage
        if !preferredLanguages.isEmpty,
           let supported = try? request.supportedRecognitionLanguages() {
            let available = preferredLanguages.filter { supported.contains($0) }
            if !available.isEmpty { request.recognitionLanguages = available }
        }

        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        guard (try? handler.perform([request])) != nil else { return [] }

        return (request.results ?? []).compactMap { observation -> QuickToolsSupport.RecognizedLine? in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            return QuickToolsSupport.RecognizedLine(text: candidate.string,
                                                    x: observation.boundingBox.minX,
                                                    y: observation.boundingBox.midY)
        }
    }

    private static func copyToPasteboard(_ value: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(value, forType: .string)
    }
}
