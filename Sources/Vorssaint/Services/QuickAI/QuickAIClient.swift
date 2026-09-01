// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

/// Talks to OpenAI with the person's own key. One request at a time; the
/// service owns cancellation. Nothing here is a background check.
enum QuickAIClient {
    static func send(chat: QuickAISupport.Chat,
                      apiKey: String,
                      languageCode: String,
                      session: URLSession = .shared) async -> Result<String, QuickAISupport.SendError> {
        let key = QuickAISupport.sanitizedAPIKey(apiKey)
        guard QuickAISupport.hasAPIKey(key) else { return .failure(.noKey) }
        guard chat.messages.contains(where: { $0.role == .user }) else { return .failure(.noText) }

        let url = chat.webSearch ? QuickAISupport.responsesURL() : QuickAISupport.chatURL()
        let body = chat.webSearch
            ? QuickAISupport.responsesBody(chat: chat, languageCode: languageCode)
            : QuickAISupport.chatCompletionsBody(chat: chat, languageCode: languageCode)
        guard let body else { return .failure(.parse) }

        let request = QuickAISupport.request(url: url, apiKey: key, body: body)
        do {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 { return .failure(.noKey) }
            if !(200...299).contains(status) {
                return .failure(QuickAISupport.httpError(status: status, data: data))
            }
            return chat.webSearch
                ? QuickAISupport.parseResponses(data)
                : QuickAISupport.parseChatCompletions(data)
        } catch is CancellationError {
            return .failure(.cancelled)
        } catch {
            return .failure(.network)
        }
    }
}
