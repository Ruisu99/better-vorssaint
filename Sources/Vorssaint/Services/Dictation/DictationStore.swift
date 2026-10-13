// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

/// Local, owner-only persistence for Dictation's own OpenAI key. Kept apart
/// from Quick AI's key file so clearing one never touches the other, even
/// though Settings offers Quick AI's key as a convenience default when this
/// one is empty (`DictationSupport.effectiveOpenAIKey`).
enum DictationStore {
    static var apiKeyURL: URL? {
        directoryURL?.appendingPathComponent("openai-api-key")
    }

    static var directoryURL: URL? {
        PrivateFileStore.containerURL?.appendingPathComponent("Dictation", isDirectory: true)
    }

    static func loadAPIKey(from url: URL? = apiKeyURL) -> String {
        guard let url,
              let data = try? Data(contentsOf: url),
              let raw = String(data: data, encoding: .utf8)
        else { return "" }
        return DictationSupport.sanitizedAPIKey(raw)
    }

    @discardableResult
    static func saveAPIKey(_ raw: String, to url: URL? = apiKeyURL) -> Bool {
        let key = DictationSupport.sanitizedAPIKey(raw)
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
}
