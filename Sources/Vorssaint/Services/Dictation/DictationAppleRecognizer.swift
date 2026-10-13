// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation
import Speech

/// Apple's on-device speech recognizer, run against the WAV file a dictation
/// hold just recorded. `requiresOnDeviceRecognition` is set so a
/// transcription never leaves this Mac; `SFSpeechRecognizer` itself only
/// touches the network for locales that have no on-device model installed,
/// which this never opts into.
enum DictationAppleRecognizer {
    static func requestAuthorizationIfNeeded() async -> Bool {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            return true
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    continuation.resume(returning: status == .authorized)
                }
            }
        case .denied, .restricted:
            return false
        @unknown default:
            return false
        }
    }

    static func transcribe(wavURL: URL,
                           language: AppLanguage) async -> Result<String, DictationSupport.TranscriptionError> {
        guard await requestAuthorizationIfNeeded() else { return .failure(.unavailable) }

        let localeIdentifier = DictationSupport.appleLocaleIdentifier(
            appLanguage: language,
            systemLocaleIdentifier: Locale.current.identifier)
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)),
              recognizer.isAvailable
        else { return .failure(.unavailable) }
        recognizer.defaultTaskHint = .dictation

        let request = SFSpeechURLRecognitionRequest(url: wavURL)
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = false

        return await withCheckedContinuation { continuation in
            var didResume = false
            recognizer.recognitionTask(with: request) { result, error in
                guard !didResume else { return }
                if let error {
                    didResume = true
                    continuation.resume(returning: .failure(.server(error.localizedDescription)))
                    return
                }
                guard let result, result.isFinal else { return }
                didResume = true
                let text = DictationSupport.sanitizedTranscript(result.bestTranscription.formattedString)
                continuation.resume(returning: text.isEmpty ? .failure(.empty) : .success(text))
            }
        }
    }
}
