// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

/// Sends the recorded WAV to OpenAI's Whisper-family transcription endpoint,
/// with the person's own key. Nothing here runs unless OpenAI is the chosen
/// engine: the audio leaves this Mac only for this one call.
enum DictationOpenAIClient {
    static func transcribe(wavURL: URL,
                           apiKey: String,
                           model: String,
                           session: URLSession = .shared)
        async -> Result<String, DictationSupport.TranscriptionError> {
        let key = DictationSupport.sanitizedAPIKey(apiKey)
        guard DictationSupport.hasAPIKey(key) else { return .failure(.noKey) }
        guard let wavData = try? Data(contentsOf: wavURL) else { return .failure(.parse) }

        let boundary = DictationSupport.multipartBoundary()
        let body = DictationSupport.multipartBody(wavData: wavData, model: model, boundary: boundary)
        let request = DictationSupport.multipartRequest(
            url: DictationSupport.openAITranscriptionsURL(),
            apiKey: key,
            body: body,
            boundary: boundary)

        do {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 { return .failure(.noKey) }
            if !(200...299).contains(status) {
                return .failure(DictationSupport.httpError(status: status, data: data))
            }
            return DictationSupport.parseOpenAITranscription(data)
        } catch is CancellationError {
            return .failure(.cancelled)
        } catch {
            return .failure(.network)
        }
    }
}
