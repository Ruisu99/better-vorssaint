// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

/// Local, owner-only persistence for Quick AI. The API key is a file of its
/// own so a settings backup can never carry it, and chats never share a
/// document with it. Photos live as JPEG files next to the JSON, never as
/// base64 inside a chat.
enum QuickAIStore {
    static var chatsURL: URL? {
        directoryURL?.appendingPathComponent("chats.json")
    }

    static var apiKeyURL: URL? {
        directoryURL?.appendingPathComponent("api-key")
    }

    static var directoryURL: URL? {
        PrivateFileStore.containerURL?.appendingPathComponent("QuickAI", isDirectory: true)
    }

    static var imagesDirectoryURL: URL? {
        directoryURL?.appendingPathComponent("Images", isDirectory: true)
    }

    static func loadChats(from url: URL? = chatsURL) -> [QuickAISupport.Chat] {
        guard let url,
              let data = try? Data(contentsOf: url),
              let chats = try? JSONDecoder().decode([QuickAISupport.Chat].self, from: data)
        else { return [] }
        return QuickAISupport.cappedChats(chats)
    }

    @discardableResult
    static func saveChats(_ chats: [QuickAISupport.Chat], to url: URL? = chatsURL) -> Bool {
        guard let url else { return false }
        let directory = url.deletingLastPathComponent()
        guard PrivateFileStore.createDirectory(at: directory) else { return false }
        let capped = QuickAISupport.cappedChats(chats)
        guard let data = try? JSONEncoder().encode(capped) else {
            return false
        }
        let wrote = PrivateFileStore.write(data, to: url)
        if wrote {
            sweepImages(keeping: capped, directory: directory.appendingPathComponent("Images",
                                                                                    isDirectory: true))
        }
        return wrote
    }

    static func loadAPIKey(from url: URL? = apiKeyURL) -> String {
        guard let url,
              let data = try? Data(contentsOf: url),
              let raw = String(data: data, encoding: .utf8)
        else { return "" }
        return QuickAISupport.sanitizedAPIKey(raw)
    }

    @discardableResult
    static func saveAPIKey(_ raw: String, to url: URL? = apiKeyURL) -> Bool {
        let key = QuickAISupport.sanitizedAPIKey(raw)
        guard let url else { return false }
        let directory = url.deletingLastPathComponent()
        guard PrivateFileStore.createDirectory(at: directory) else { return false }
        if key.isEmpty {
            try? FileManager.default.removeItem(at: url)
            return true
        }
        guard let data = key.data(using: .utf8) else { return false }
        return PrivateFileStore.write(data, to: url)
    }

    static func upsert(_ chat: QuickAISupport.Chat,
                       in chats: [QuickAISupport.Chat]) -> [QuickAISupport.Chat] {
        var next = chats.filter { $0.id != chat.id }
        next.insert(chat, at: 0)
        return QuickAISupport.cappedChats(next)
    }

    static func imagesDirectory(relativeTo chatsURL: URL? = chatsURL) -> URL? {
        chatsURL?.deletingLastPathComponent().appendingPathComponent("Images", isDirectory: true)
    }

    @discardableResult
    static func saveImageData(_ data: Data,
                              fileName: String,
                              directory: URL? = imagesDirectoryURL) -> String? {
        guard let name = QuickAISupport.sanitizedImageFileName(fileName),
              !data.isEmpty,
              let directory
        else { return nil }
        guard PrivateFileStore.createDirectory(at: directory) else { return nil }
        let url = directory.appendingPathComponent(name)
        guard PrivateFileStore.write(data, to: url) else { return nil }
        return name
    }

    static func loadImageData(named raw: String,
                              directory: URL? = imagesDirectoryURL) -> Data? {
        guard let name = QuickAISupport.sanitizedImageFileName(raw),
              let directory
        else { return nil }
        return try? Data(contentsOf: directory.appendingPathComponent(name))
    }

    static func deleteImage(named raw: String, directory: URL? = imagesDirectoryURL) {
        guard let name = QuickAISupport.sanitizedImageFileName(raw),
              let directory
        else { return }
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
    }

    /// Photos that belong to chats still on disk stay; everything else goes.
    static func sweepImages(keeping chats: [QuickAISupport.Chat],
                            directory: URL? = imagesDirectoryURL) {
        guard let directory else { return }
        let kept = Set(chats.flatMap { chat in
            chat.messages.flatMap { message in
                message.images.compactMap { QuickAISupport.sanitizedImageFileName($0.fileName) }
            }
        })
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        for name in names {
            guard let sanitized = QuickAISupport.sanitizedImageFileName(name) else {
                try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
                continue
            }
            if !kept.contains(sanitized) {
                try? FileManager.default.removeItem(at: directory.appendingPathComponent(sanitized))
            }
        }
    }

    static func resolvedImages(for chat: QuickAISupport.Chat,
                               directory: URL? = imagesDirectoryURL)
        -> [UUID: [QuickAISupport.ResolvedImage]] {
        var map: [UUID: [QuickAISupport.ResolvedImage]] = [:]
        for message in chat.messages where message.hasPhotos {
            var resolved: [QuickAISupport.ResolvedImage] = []
            for image in message.images {
                guard let data = loadImageData(named: image.fileName, directory: directory),
                      !data.isEmpty
                else { continue }
                let mime = image.mimeType.trimmingCharacters(in: .whitespacesAndNewlines)
                resolved.append(QuickAISupport.ResolvedImage(
                    mimeType: mime.isEmpty ? "image/jpeg" : mime,
                    dataURL: QuickAISupport.dataURL(mimeType: mime, data: data)))
            }
            if !resolved.isEmpty {
                map[message.id] = resolved
            }
        }
        return map
    }
}
