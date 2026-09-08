// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

/// Runs a Parakeet transcription through a short-lived `python3` process.
/// Nothing is bundled: the roughly 2 GB model lives wherever `parakeet-mlx`
/// itself caches it (its own Hugging Face cache, populated on first use),
/// and this app only shells out to a script generated fresh for the one WAV
/// file that needs transcribing. Everything stays on this Mac.
///
/// Limitation: every call pays for the Python interpreter starting up AND
/// the model loading from disk again, because nothing here keeps a process
/// warm between key presses. That cost (commonly several seconds, more on
/// the very first run while the model downloads) is the trade for staying a
/// short `Process` call instead of a standing helper daemon; someone who
/// dictates back-to-back phrases will feel it far more than with Apple's
/// on-device engine.
enum DictationParakeetRunner {
    private static let pythonLauncher = "/usr/bin/env"
    private static let availabilityQueue = DispatchQueue(
        label: "com.vorssaint.utils.dictation-parakeet-probe")
    private static var cachedAvailability: Bool?

    /// Cached after the first check: importing a package is cheap but not
    /// free, and Settings may re-read this every time the page appears.
    static func isAvailable() -> Bool {
        availabilityQueue.sync {
            if let cachedAvailability { return cachedAvailability }
            let result = Shell.run(pythonLauncher, ["python3", "-c", DictationSupport.parakeetAvailabilityProbe])
            let available = result.status == 0
            cachedAvailability = available
            return available
        }
    }

    /// Forces the next `isAvailable()` to probe again, for Settings' "check
    /// again" action after the person runs the pip install.
    static func invalidateAvailabilityCache() {
        availabilityQueue.sync { cachedAvailability = nil }
    }

    static func transcribe(wavURL: URL) async -> Result<String, DictationSupport.TranscriptionError> {
        guard isAvailable() else { return .failure(.unavailable) }
        return await Task.detached(priority: .userInitiated) {
            let scriptURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("vorssaint-dictation-\(UUID().uuidString).py")
            let script = DictationSupport.parakeetScript(modelName: DictationSupport.parakeetModel)
            guard (try? script.write(to: scriptURL, atomically: true, encoding: .utf8)) != nil else {
                return .failure(.parse)
            }
            defer { try? FileManager.default.removeItem(at: scriptURL) }

            let result = Shell.run(pythonLauncher,
                                   ["python3", scriptURL.path, wavURL.path],
                                   timeout: DictationSupport.parakeetProcessTimeout)
            guard result.status == 0 else { return .failure(.server(result.output)) }
            let text = DictationSupport.cleanedParakeetOutput(result.output)
            return text.isEmpty ? .failure(.empty) : .success(text)
        }.value
    }
}
