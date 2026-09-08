// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

/// Local, owner-only persistence for Quick AI. The API key is a file of its
/// own so a settings backup can never carry it, and chats never share a
/// document with it.
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
        guard let data = try? JSONEncoder().encode(QuickAISupport.cappedChats(chats)) else {
            return false
        }
        return PrivateFileStore.write(data, to: url)
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
}
