// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Carbon.HIToolbox
import Foundation

/// Pure helpers behind Dictation: which key to hold, which engine transcribes,
/// how each engine's own settings are sanitized, and the small state machine
/// that turns hold-key events into start/stop decisions. Kept free of
/// AppKit, AVFoundation and Speech so the harness can test it without a
/// running app.
///
/// Privacy: the Apple and Parakeet engines never leave this Mac. The OpenAI
/// engine sends the recorded audio to api.openai.com, and only while it is
/// the engine chosen in Settings and a key has been entered.
enum DictationSupport {
    static let openAIHost = "api.openai.com"
    static let openAITranscriptionsPath = "/v1/audio/transcriptions"
    static let defaultOpenAIModel = "gpt-4o-mini-transcribe"
    static let allowedOpenAIModels = ["gpt-4o-mini-transcribe", "whisper-1"]
    static let parakeetModel = "mlx-community/parakeet-tdt-0.6b-v3"
    static let parakeetInstallHint = "pip install parakeet-mlx"
    static let requestTimeout: TimeInterval = 60
    static let parakeetProcessTimeout: TimeInterval = 120
    /// A guardrail against a stuck key: nothing is dictated forever.
    static let maximumRecordingSeconds: TimeInterval = 120

    // MARK: - Engine

    enum Engine: String, CaseIterable, Identifiable {
        case apple
        case openAI
        case parakeet

        var id: String { rawValue }

        static let defaultEngine: Engine = .apple

        static func sanitized(_ raw: String?) -> Engine {
            guard let raw, let engine = Engine(rawValue: raw) else { return defaultEngine }
            return engine
        }
    }

    // MARK: - Hold key

    /// Modifier keys that can be held on their own without breaking typing:
    /// every option, command, control and shift key that has a distinct left
    /// or right side. Caps Lock and Fn are left out on purpose — Caps Lock
    /// locks rather than holds, and Fn is not a key most keyboards report as
    /// a plain, poll-able modifier.
    enum HoldKey: String, CaseIterable, Identifiable {
        case rightOption
        case leftOption
        case rightCommand
        case rightControl
        case rightShift

        var id: String { rawValue }

        static let defaultKey: HoldKey = .rightOption

        static func sanitized(_ raw: String?) -> HoldKey {
            guard let raw, let key = HoldKey(rawValue: raw) else { return defaultKey }
            return key
        }

        var keyCode: Int64 {
            switch self {
            case .rightOption: return Int64(kVK_RightOption)
            case .leftOption: return Int64(kVK_Option)
            case .rightCommand: return Int64(kVK_RightCommand)
            case .rightControl: return Int64(kVK_RightControl)
            case .rightShift: return Int64(kVK_RightShift)
            }
        }

        /// The modifier mask a `flagsChanged` event carries while this key is
        /// down. Two keys can share a mask (left and right Option both set
        /// `.maskAlternate`), so holding the other one of a pair at the same
        /// moment can read as this key still being down for an instant after
        /// release — an accepted trade-off for needing no keyboard remapping.
        var modifiers: GlobalShortcutModifiers {
            switch self {
            case .rightOption, .leftOption: return .option
            case .rightCommand: return .command
            case .rightControl: return .control
            case .rightShift: return .shift
            }
        }

        var systemImage: String {
            switch self {
            case .rightOption, .leftOption: return "option"
            case .rightCommand: return "command"
            case .rightControl: return "control"
            case .rightShift: return "shift"
            }
        }

        var symbol: String {
            switch self {
            case .rightOption, .leftOption: return "⌥"
            case .rightCommand: return "⌘"
            case .rightControl: return "⌃"
            case .rightShift: return "⇧"
            }
        }
    }

    // MARK: - Hold state machine

    /// One `flagsChanged` event for the configured hold key, reduced to
    /// whether its own flag is now down. The service maps `CGEventFlags` to
    /// this before calling `decide`, so the state machine itself needs no
    /// CoreGraphics import.
    enum HoldEvent: Equatable {
        case keyDown
        case keyUp
    }

    enum HoldDecision: Equatable {
        case startRecording
        /// `discard` is true for a press too short to be a real dictation
        /// (an accidental tap while reaching for something else).
        case stopRecording(discard: Bool)
        case none
    }

    /// Whether the hold key is currently down, and for how long, so a release
    /// can tell a real dictation from a stray tap. One instance lives on the
    /// service's tap thread; nothing here touches the main thread.
    struct HoldState: Equatable {
        static let minimumRecordingSeconds: TimeInterval = 0.15

        private(set) var isDown = false
        private var downAt: TimeInterval?

        mutating func decide(_ event: HoldEvent, now: TimeInterval) -> HoldDecision {
            switch event {
            case .keyDown:
                guard !isDown else { return .none }
                isDown = true
                downAt = now
                return .startRecording
            case .keyUp:
                guard isDown else { return .none }
                isDown = false
                let elapsed = downAt.map { now - $0 } ?? Self.minimumRecordingSeconds
                downAt = nil
                return .stopRecording(discard: elapsed < Self.minimumRecordingSeconds)
            }
        }

        mutating func reset() {
            isDown = false
            downAt = nil
        }
    }

    // MARK: - Apple Speech

    /// The locale `SFSpeechRecognizer` should use: German when the app's own
    /// language is German, the system's own locale otherwise. The Parakeet
    /// model is multilingual and reads the same signal through
    /// `parakeetLanguageHint`.
    static func appleLocaleIdentifier(appLanguage: AppLanguage,
                                      systemLocaleIdentifier: String) -> String {
        appLanguage == .de ? "de-DE" : systemLocaleIdentifier
    }

    // MARK: - OpenAI Whisper

    static func sanitizedOpenAIModel(_ raw: String?) -> String {
        guard let raw, allowedOpenAIModels.contains(raw) else { return defaultOpenAIModel }
        return raw
    }

    static func openAIModelDisplayName(_ model: String) -> String {
        model == "whisper-1" ? "Whisper-1" : "GPT-4o mini Transcribe"
    }

    /// Only the OpenAI API, over HTTPS, so a custom "endpoint" can never
    /// silently redirect the recording somewhere else.
    static func openAITranscriptionsURL() -> URL {
        URL(string: "https://\(openAIHost)\(openAITranscriptionsPath)")!
    }

    static func sanitizedAPIKey(_ raw: String?) -> String {
        (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func hasAPIKey(_ raw: String?) -> Bool {
        sanitizedAPIKey(raw).count >= 8
    }

    /// The key actually used: the person's own Dictation key when they set
    /// one, otherwise the Quick AI key already on this Mac (still their own
    /// key, just not typed a second time). Empty when neither is set.
    static func effectiveOpenAIKey(ownKey: String, quickAIKey: String) -> String {
        let own = sanitizedAPIKey(ownKey)
        return own.isEmpty ? sanitizedAPIKey(quickAIKey) : own
    }

    /// A boundary the recording itself cannot contain, since it never
    /// contains this ASCII marker text at all.
    static func multipartBoundary() -> String {
        "vorssaint-dictation-\(UUID().uuidString)"
    }

    /// multipart/form-data body for the transcriptions endpoint: the model
    /// field and the WAV file, boundary-delimited the way the endpoint
    /// requires.
    static func multipartBody(wavData: Data, model: String, boundary: String) -> Data {
        var body = Data()
        func appendField(name: String, value: String) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append(
                "Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        appendField(name: "model", value: model)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append(
            "Content-Disposition: form-data; name=\"file\"; filename=\"dictation.wav\"\r\n"
                .data(using: .utf8)!)
        body.append("Content-Type: audio/wav\r\n\r\n".data(using: .utf8)!)
        body.append(wavData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        return body
    }

    static func multipartRequest(url: URL, apiKey: String, body: Data, boundary: String) -> URLRequest {
        var request = URLRequest(url: url, timeoutInterval: requestTimeout)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        return request
    }

    enum TranscriptionError: Error, Equatable {
        case noKey
        case network
        case empty
        case parse
        case server(String)
        case cancelled
        /// The engine itself could not run (Speech denied, Parakeet missing).
        case unavailable
    }

    static func parseOpenAITranscription(_ data: Data) -> Result<String, TranscriptionError> {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return .failure(.parse)
        }
        if let error = object["error"] as? [String: Any],
           let message = error["message"] as? String, !message.isEmpty {
            return .failure(.server(message))
        }
        guard let text = object["text"] as? String else { return .failure(.parse) }
        let trimmed = sanitizedTranscript(text)
        return trimmed.isEmpty ? .failure(.empty) : .success(trimmed)
    }

    static func httpError(status: Int, data: Data) -> TranscriptionError {
        if case .failure(let error) = parseOpenAITranscription(data), case .server = error {
            return error
        }
        if status == 401 { return .noKey }
        return .network
    }

    // MARK: - Parakeet (local)

    /// The probe used to decide whether the picker offers Parakeet at all:
    /// it fails loudly (non-zero exit) when the package is missing, and
    /// prints nothing a caller has to parse.
    static let parakeetAvailabilityProbe = "import parakeet_mlx"

    /// The little script generated to run one transcription. Written fresh
    /// to a temp file each time rather than shipped as a resource, so there
    /// is nothing on disk to tamper with between checks and the model name
    /// always matches what Settings shows.
    static func parakeetScript(modelName: String) -> String {
        """
        import sys
        from parakeet_mlx import from_pretrained

        model = from_pretrained("\(modelName)")
        result = model.transcribe(sys.argv[1])
        print(result.text)
        """
    }

    static func cleanedParakeetOutput(_ raw: String) -> String {
        // The script prints exactly one line; any warning a library writes to
        // stdout instead of stderr would otherwise ride along as "text".
        let lines = raw
            .split(separator: "\n", omittingEmptySubsequences: true)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return lines.last ?? ""
    }

    // MARK: - Text insertion

    /// Never insert whitespace-only output: a very short or misheard
    /// recording should not leave a stray space at the caret.
    static func sanitizedTranscript(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
