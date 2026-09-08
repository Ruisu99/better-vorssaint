// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

/// Talks to OpenAI with the person's own key. One request at a time; the
/// service owns cancellation. Replies arrive as SSE so the bubble can type
/// instead of waiting for the whole answer.
enum QuickAIClient {
    static func send(chat: QuickAISupport.Chat,
                      apiKey: String,
                      languageCode: String,
                      reasoningEffort: String = QuickAISupport.defaultReasoningEffort,
                      session: URLSession = .shared,
                      onDelta: (@Sendable (String) async -> Void)? = nil)
    async -> Result<String, QuickAISupport.SendError> {
        let key = QuickAISupport.sanitizedAPIKey(apiKey)
        guard QuickAISupport.hasAPIKey(key) else { return .failure(.noKey) }
        guard chat.messages.contains(where: { $0.role == .user }) else { return .failure(.noText) }

        let useResponses = QuickAISupport.usesResponsesAPI(model: chat.model, webSearch: chat.webSearch)
        let url = useResponses ? QuickAISupport.responsesURL() : QuickAISupport.chatURL()
        let body = useResponses
            ? QuickAISupport.responsesBody(chat: chat,
                                           languageCode: languageCode,
                                           reasoningEffort: reasoningEffort,
                                           stream: true)
            : QuickAISupport.chatCompletionsBody(chat: chat,
                                                 languageCode: languageCode,
                                                 reasoningEffort: reasoningEffort,
                                                 stream: true)
        guard let body else { return .failure(.parse) }

        let request = QuickAISupport.request(url: url, apiKey: key, body: body, stream: true)
        do {
            let (bytes, response) = try await session.bytes(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 { return .failure(.noKey) }
            if !(200...299).contains(status) {
                let data = try await collectPrefix(from: bytes, limit: 8_192)
                return .failure(QuickAISupport.httpError(status: status, data: data))
            }
            return try await readStream(bytes, responses: useResponses, onDelta: onDelta)
        } catch is CancellationError {
            return .failure(.cancelled)
        } catch {
            return .failure(.network)
        }
    }

    private static func readStream(_ bytes: URLSession.AsyncBytes,
                                   responses: Bool,
                                   onDelta: (@Sendable (String) async -> Void)?)
    async throws -> Result<String, QuickAISupport.SendError> {
        var assembled = ""
        var lastFlush = ContinuousClock.now
        var sawDone = false
        for try await line in bytes.lines {
            if Task.isCancelled { return .failure(.cancelled) }
            switch QuickAISupport.parseSSELine(line, responses: responses) {
            case .ignore:
                continue
            case .delta(let piece):
                assembled += piece
                let now = ContinuousClock.now
                if now - lastFlush >= .milliseconds(32) {
                    lastFlush = now
                    await onDelta?(assembled)
                }
            case .done:
                sawDone = true
            case .error(let error):
                return .failure(error)
            }
            if sawDone { break }
        }
        await onDelta?(assembled)
        guard let cleaned = QuickAISupport.cleanedOutput(assembled) else { return .failure(.empty) }
        return .success(cleaned)
    }

    private static func collectPrefix(from bytes: URLSession.AsyncBytes, limit: Int) async throws -> Data {
        var data = Data()
        for try await byte in bytes {
            data.append(byte)
            if data.count >= limit { break }
        }
        return data
    }
}
