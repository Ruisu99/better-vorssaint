// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AVFoundation
import Foundation

/// Records the microphone to a temporary 16 kHz mono WAV file for exactly as
/// long as the dictation key is held. One recorder per session; `stop()`
/// tears the engine back down so nothing keeps the microphone open between
/// presses. Main-thread only, like the service that owns it.
final class DictationAudioCapture {
    /// 16 kHz mono is what every engine here actually wants: Apple's
    /// recognizer and OpenAI's Whisper both resample anyway, and Parakeet's
    /// own pipeline expects 16 kHz, so recording at that rate skips a
    /// resampling step instead of hiding one inside every transcriber.
    private static let targetSampleRate: Double = 16_000

    enum CaptureError: Error {
        case engineFailed
        case fileFailed
    }

    private let engine = AVAudioEngine()
    private var file: AVAudioFile?
    private var fileURL: URL?
    private var isRecording = false

    /// Starts recording to a fresh temporary file and returns its URL.
    /// Throws when the input node cannot be tapped (no microphone, or access
    /// was revoked between the permission check and this call).
    func start() throws -> URL {
        stop()
        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard let outputFormat = AVAudioFormat(commonFormat: .pcmFormatInt16,
                                               sampleRate: Self.targetSampleRate,
                                               channels: 1,
                                               interleaved: true),
              let converter = AVAudioConverter(from: inputFormat, to: outputFormat)
        else { throw CaptureError.engineFailed }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("vorssaint-dictation-\(UUID().uuidString).wav")
        guard let recordingFile = try? AVAudioFile(forWriting: url,
                                                   settings: outputFormat.settings,
                                                   commonFormat: .pcmFormatInt16,
                                                   interleaved: true)
        else { throw CaptureError.fileFailed }

        input.installTap(onBus: 0, bufferSize: 2_048, format: inputFormat) { [weak self] buffer, _ in
            self?.write(buffer, converter: converter, outputFormat: outputFormat, to: recordingFile)
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            throw CaptureError.engineFailed
        }

        file = recordingFile
        fileURL = url
        isRecording = true
        return url
    }

    /// Stops the engine and closes the file. Returns the recorded file's URL
    /// (the caller transcribes it and then deletes it), or nil when nothing
    /// was recording.
    @discardableResult
    func stop() -> URL? {
        guard isRecording else { return nil }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isRecording = false
        file = nil
        let url = fileURL
        fileURL = nil
        return url
    }

    private func write(_ buffer: AVAudioPCMBuffer,
                       converter: AVAudioConverter,
                       outputFormat: AVAudioFormat,
                       to file: AVAudioFile) {
        let ratio = outputFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 16
        guard let converted = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity)
        else { return }

        var consumed = false
        var error: NSError?
        let status = converter.convert(to: converted, error: &error) { _, outStatus in
            if consumed {
                outStatus.pointee = .noDataNow
                return nil
            }
            consumed = true
            outStatus.pointee = .haveData
            return buffer
        }
        guard status != .error, error == nil else { return }
        try? file.write(from: converted)
    }
}
