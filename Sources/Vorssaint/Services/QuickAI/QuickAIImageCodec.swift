// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AppKit
import ImageIO
import UniformTypeIdentifiers

/// Turns pasteboard pixels, dropped files and clipboard-history PNGs into a
/// JPEG the vision request can carry. Pixels win over leftover text or a
/// file URL, the same way clipboard history now keeps a screenshot.
enum QuickAIImageCodec {
    static let maxPixelSize = 2_048
    static let jpegQuality = 0.72
    static let dropTypes: [UTType] = [.image, .png, .jpeg, .tiff, .fileURL]

    struct Prepared: Equatable {
        var data: Data
        var mimeType: String
        var width: Int
        var height: Int
        var title: String
    }

    static func prepare(data: Data, title: String = "") -> Prepared? {
        guard !data.isEmpty,
              data.count <= ClipboardHistoryCaptureSupport.maxRawImageBytes,
              let image = NSImage(data: data)
        else { return nil }
        return prepare(image: image, title: title)
    }

    static func prepare(image: NSImage, title: String = "") -> Prepared? {
        guard let cg = rasterized(image) else { return nil }
        let scaled = scaled(cg, maxPixel: maxPixelSize)
        guard let jpeg = jpegData(from: scaled),
              jpeg.count > 0,
              jpeg.count <= QuickAISupport.maximumVisionImageBytes
        else { return nil }
        return Prepared(data: jpeg,
                        mimeType: "image/jpeg",
                        width: scaled.width,
                        height: scaled.height,
                        title: title)
    }

    static func prepare(fileURL url: URL, title: String = "") -> Prepared? {
        let file = url.standardizedFileURL
        guard file.isFileURL,
              ClipboardHistoryImageSupport.isImageFilePath(file.path),
              let data = try? Data(contentsOf: file)
        else { return nil }
        let name = title.isEmpty ? file.deletingPathExtension().lastPathComponent : title
        return prepare(data: data, title: name)
    }

    /// Pasteboard order matches clipboard history: pixels first, then an
    /// image file URL. Leftover text is never treated as the photo.
    static func images(from pasteboard: NSPasteboard) -> [Prepared] {
        var prepared: [Prepared] = []
        let title = ClipboardHistoryCaptureSupport.imageTitle(
            from: pasteboard.string(forType: .string)) ?? ""
        if let pixels = pixelData(from: pasteboard),
           let image = prepare(data: pixels, title: title) {
            prepared.append(image)
        }
        if prepared.isEmpty {
            for url in fileURLs(from: pasteboard) {
                if let image = prepare(fileURL: url, title: title) {
                    prepared.append(image)
                }
                if prepared.count >= QuickAISupport.maximumImagesPerMessage { break }
            }
        }
        return Array(prepared.prefix(QuickAISupport.maximumImagesPerMessage))
    }

    static func pasteboardHasImage(_ pasteboard: NSPasteboard) -> Bool {
        if pasteboard.data(forType: .png) != nil { return true }
        if pasteboard.data(forType: .tiff) != nil { return true }
        return fileURLs(from: pasteboard).contains {
            ClipboardHistoryImageSupport.isImageFilePath($0.path)
        }
    }

    private static func pixelData(from pasteboard: NSPasteboard) -> Data? {
        if let png = pasteboard.data(forType: .png), !png.isEmpty { return png }
        if let tiff = pasteboard.data(forType: .tiff), !tiff.isEmpty { return tiff }
        return nil
    }

    private static func fileURLs(from pasteboard: NSPasteboard) -> [URL] {
        let options: [NSPasteboard.ReadingOptionKey: Any] = [.urlReadingFileURLsOnly: true]
        if let urls = pasteboard.readObjects(forClasses: [NSURL.self], options: options) as? [URL],
           !urls.isEmpty {
            return urls.map(\.standardizedFileURL)
        }
        if let paths = pasteboard.propertyList(
            forType: NSPasteboard.PasteboardType("NSFilenamesPboardType")) as? [String] {
            return paths.map { URL(fileURLWithPath: $0).standardizedFileURL }
        }
        return []
    }

    private static func rasterized(_ image: NSImage) -> CGImage? {
        var rect = NSRect(origin: .zero, size: image.size)
        if let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) {
            return cg
        }
        guard let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff)
        else { return nil }
        return rep.cgImage
    }

    private static func scaled(_ image: CGImage, maxPixel: Int) -> CGImage {
        let width = image.width
        let height = image.height
        let longest = max(width, height)
        guard longest > maxPixel, longest > 0 else { return image }
        let scale = Double(maxPixel) / Double(longest)
        let nextWidth = max(1, Int((Double(width) * scale).rounded()))
        let nextHeight = max(1, Int((Double(height) * scale).rounded()))
        guard let context = CGContext(data: nil,
                                      width: nextWidth,
                                      height: nextHeight,
                                      bitsPerComponent: 8,
                                      bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
                ?? CGContext(data: nil,
                             width: nextWidth,
                             height: nextHeight,
                             bitsPerComponent: 8,
                             bytesPerRow: 0,
                             space: CGColorSpaceCreateDeviceRGB(),
                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return image }
        context.interpolationQuality = .medium
        context.draw(image, in: CGRect(x: 0, y: 0, width: nextWidth, height: nextHeight))
        return context.makeImage() ?? image
    }

    private static func jpegData(from image: CGImage) -> Data? {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            data, UTType.jpeg.identifier as CFString, 1, nil)
        else { return nil }
        CGImageDestinationAddImage(destination, image, [
            kCGImageDestinationLossyCompressionQuality: jpegQuality,
        ] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return data as Data
    }
}
