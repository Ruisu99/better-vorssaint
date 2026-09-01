// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AppKit
import Carbon.HIToolbox
import CoreGraphics
import Foundation

/// Hold-key dictation: holding the configured key records the microphone,
/// releasing it transcribes what was said and types the result in at the
/// caret, the same way `TextSnippetService` types an expansion.
///
/// Privacy: the Apple and Parakeet engines run entirely on this Mac. Only the
/// OpenAI engine sends the recording anywhere, and only while it is the
/// engine chosen in Settings.
///
/// Requires Microphone access to record, and Accessibility to both watch the
/// hold key (a session event tap) and type the result in.
final class DictationService: ObservableObject {
    static let shared = DictationService()

    @Published private(set) var isRecording = false
    @Published private(set) var isTranscribing = false
    @Published private(set) var lastError: String?

    private let audioCapture = DictationAudioCapture()
    private var transcriptionTask: Task<Void, Never>?
    private var maxDurationWatchdog: DispatchWorkItem?

    // The tap callback and the hold state it drives live off the main
    // thread, mirroring TextSnippetService and SuperKeyService: a demanding
    // foreground app must never turn a main-thread stall into a stuck key.
    private let lifecycleLock = NSLock()
    private var tap: CFMachPort?
    private var tapRunLoop: CFRunLoop?
    private var tapThread: Thread?
    private var shouldStopTapThread = false
    private var pendingTapRestart = false

    private let stateLock = NSLock()
    private var holdState = DictationSupport.HoldState()
    private var holdKey = DictationSupport.HoldKey.defaultKey

    private init() {}

    func syncWithPreferences() {
        let defaults = UserDefaults.standard
        let key = DictationSupport.HoldKey.sanitized(defaults.string(forKey: DefaultsKey.dictationHoldKey))
        stateLock.withLock { holdKey = key }

        let enabled = AppFeature.dictation.isAvailable
            && defaults.bool(forKey: DefaultsKey.dictationEnabled)
        guard enabled, Permissions.shared.accessibility else {
            stop()
            return
        }
        start()
    }

    func suspend() { stop(synchronously: true) }

    // MARK: - Tap lifecycle

    private func start() {
        let tapExists = lifecycleLock.withLock { tap != nil && !shouldStopTapThread }
        guard !tapExists else { return }
        let thread = lifecycleLock.withLock { () -> Thread? in
            if tapThread != nil {
                if shouldStopTapThread { pendingTapRestart = true }
                return nil
            }
            shouldStopTapThread = false
            pendingTapRestart = false
            let thread = Thread { [weak self] in self?.runEventTap() }
            thread.name = "Vorssaint Dictation"
            thread.qualityOfService = .userInteractive
            tapThread = thread
            return thread
        }
        thread?.start()
    }

    private func stop(synchronously: Bool = false) {
        let snapshot = lifecycleLock.withLock {
            () -> (runLoop: CFRunLoop?, tap: CFMachPort?, threadExists: Bool) in
            shouldStopTapThread = true
            pendingTapRestart = false
            return (tapRunLoop, tap, tapThread != nil)
        }
        if let tap = snapshot.tap { CGEvent.tapEnable(tap: tap, enable: false) }
        if let runLoop = snapshot.runLoop {
            CFRunLoopPerformBlock(runLoop, CFRunLoopMode.commonModes.rawValue) {
                CFRunLoopStop(runLoop)
            }
            CFRunLoopWakeUp(runLoop)
        } else if !snapshot.threadExists {
            lifecycleLock.withLock {
                shouldStopTapThread = false
                tapThread = nil
            }
        }
        let cancel = { [weak self] in self?.cancelRecording() }
        if synchronously, Thread.isMainThread {
            cancel()
        } else {
            DispatchQueue.main.async(execute: cancel)
        }
    }

    private func runEventTap() {
        autoreleasepool {
            let runLoop = CFRunLoopGetCurrent()
            lifecycleLock.withLock { tapRunLoop = runLoop }
            guard !lifecycleLock.withLock({ shouldStopTapThread }) else {
                if clearEventTapThread() { startOnMain() }
                return
            }

            // Listen-only: dictation only watches the hold key, it never
            // needs to swallow or alter it, so every other app keeps seeing
            // modifier changes exactly as it always has.
            let mask = CGEventMask(1) << CGEventType.flagsChanged.rawValue
            guard let tap = CGEvent.tapCreate(
                tap: .cgSessionEventTap,
                place: .headInsertEventTap,
                options: .listenOnly,
                eventsOfInterest: mask,
                callback: { _, type, event, userInfo in
                    guard let userInfo else { return Unmanaged.passUnretained(event) }
                    let service = Unmanaged<DictationService>.fromOpaque(userInfo).takeUnretainedValue()
                    return service.handle(type: type, event: event)
                },
                userInfo: Unmanaged.passUnretained(self).toOpaque()
            ) else {
                _ = clearEventTapThread()
                return
            }

            let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
            lifecycleLock.withLock { self.tap = tap }
            CFRunLoopAddSource(runLoop, source, .commonModes)
            CGEvent.tapEnable(tap: tap, enable: true)

            if lifecycleLock.withLock({ shouldStopTapThread }) {
                CGEvent.tapEnable(tap: tap, enable: false)
            } else {
                CFRunLoopRun()
            }

            CGEvent.tapEnable(tap: tap, enable: false)
            CFRunLoopRemoveSource(runLoop, source, .commonModes)
            CFMachPortInvalidate(tap)
            if clearEventTapThread() { startOnMain() }
        }
    }

    private func clearEventTapThread() -> Bool {
        lifecycleLock.withLock {
            let shouldRestart = pendingTapRestart
            tap = nil
            tapRunLoop = nil
            tapThread = nil
            shouldStopTapThread = false
            pendingTapRestart = false
            return shouldRestart
        }
    }

    private func startOnMain() {
        DispatchQueue.main.async { [weak self] in self?.start() }
    }

    // MARK: - The tap

    private func handle(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            let currentTap = lifecycleLock.withLock { shouldStopTapThread ? nil : tap }
            if let currentTap { CGEvent.tapEnable(tap: currentTap, enable: true) }
            stateLock.withLock { holdState.reset() }
            return Unmanaged.passUnretained(event)
        }
        guard type == .flagsChanged else { return Unmanaged.passUnretained(event) }

        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let (matchedKey, isDown) = stateLock.withLock { () -> (Bool, Bool) in
            guard keyCode == holdKey.keyCode else { return (false, false) }
            return (true, GlobalShortcutModifiers(cgFlags: event.flags).contains(holdKey.modifiers))
        }
        guard matchedKey else { return Unmanaged.passUnretained(event) }

        let now = ProcessInfo.processInfo.systemUptime
        let decision = stateLock.withLock { holdState.decide(isDown ? .keyDown : .keyUp, now: now) }
        switch decision {
        case .startRecording:
            DispatchQueue.main.async { [weak self] in self?.beginRecording() }
        case .stopRecording(let discard):
            DispatchQueue.main.async { [weak self] in self?.endRecording(discard: discard) }
        case .none:
            break
        }
        return Unmanaged.passUnretained(event)
    }

    // MARK: - Recording

    private func beginRecording() {
        guard !isRecording else { return }
        guard Permissions.shared.microphone == .granted else {
            Permissions.shared.requestMicrophone { [weak self] granted in
                guard granted else {
                    self?.lastError = FeatureStrings.dictation(L10n.shared.language).noMicrophone
                    return
                }
                self?.beginRecording()
            }
            return
        }
        do {
            _ = try audioCapture.start()
            isRecording = true
            lastError = nil
            QuickToolHUD.showDictation(message: FeatureStrings.dictation(L10n.shared.language).recording)
            armMaxDurationWatchdog()
        } catch {
            lastError = FeatureStrings.dictation(L10n.shared.language).recordingFailed
        }
    }

    private func endRecording(discard: Bool) {
        cancelMaxDurationWatchdog()
        guard isRecording else { return }
        isRecording = false
        guard let url = audioCapture.stop() else {
            QuickToolHUD.dismissDictation()
            return
        }
        guard !discard else {
            try? FileManager.default.removeItem(at: url)
            QuickToolHUD.dismissDictation()
            return
        }
        transcribe(url)
    }

    /// Stops everything in flight without transcribing: the feature just
    /// went off, or Accessibility was revoked mid-hold.
    private func cancelRecording() {
        cancelMaxDurationWatchdog()
        transcriptionTask?.cancel()
        transcriptionTask = nil
        isTranscribing = false
        stateLock.withLock { holdState.reset() }
        guard isRecording else { return }
        isRecording = false
        if let url = audioCapture.stop() {
            try? FileManager.default.removeItem(at: url)
        }
        QuickToolHUD.dismissDictation()
    }

    private func armMaxDurationWatchdog() {
        maxDurationWatchdog?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.endRecording(discard: false) }
        maxDurationWatchdog = work
        DispatchQueue.main.asyncAfter(deadline: .now() + DictationSupport.maximumRecordingSeconds,
                                      execute: work)
    }

    private func cancelMaxDurationWatchdog() {
        maxDurationWatchdog?.cancel()
        maxDurationWatchdog = nil
    }

    // MARK: - Transcription

    private func transcribe(_ url: URL) {
        isTranscribing = true
        QuickToolHUD.updateDictation(message: FeatureStrings.dictation(L10n.shared.language).transcribing)
        let engine = DictationSupport.Engine.sanitized(
            UserDefaults.standard.string(forKey: DefaultsKey.dictationEngine))
        let language = L10n.shared.language
        let openAIModel = DictationSupport.sanitizedOpenAIModel(
            UserDefaults.standard.string(forKey: DefaultsKey.dictationOpenAIModel))
        let openAIKey = DictationSupport.effectiveOpenAIKey(
            ownKey: DictationStore.loadAPIKey(),
            quickAIKey: QuickAIStore.loadAPIKey())

        transcriptionTask?.cancel()
        transcriptionTask = Task { [weak self] in
            defer { try? FileManager.default.removeItem(at: url) }
            let result = await Self.runTranscription(engine: engine, wavURL: url, language: language,
                                                      openAIModel: openAIModel, openAIKey: openAIKey)
            await MainActor.run {
                guard let self else { return }
                self.isTranscribing = false
                self.transcriptionTask = nil
                switch result {
                case .success(let text):
                    self.insert(text)
                    self.lastError = nil
                case .failure(.cancelled):
                    break
                case .failure(let error):
                    self.lastError = self.message(for: error)
                }
                QuickToolHUD.dismissDictation()
            }
        }
    }

    private static func runTranscription(engine: DictationSupport.Engine,
                                         wavURL: URL,
                                         language: AppLanguage,
                                         openAIModel: String,
                                         openAIKey: String)
        async -> Result<String, DictationSupport.TranscriptionError> {
        switch engine {
        case .apple:
            return await DictationAppleRecognizer.transcribe(wavURL: wavURL, language: language)
        case .openAI:
            return await DictationOpenAIClient.transcribe(wavURL: wavURL, apiKey: openAIKey, model: openAIModel)
        case .parakeet:
            return await DictationParakeetRunner.transcribe(wavURL: wavURL)
        }
    }

    private func insert(_ text: String) {
        let sanitized = DictationSupport.sanitizedTranscript(text)
        guard !sanitized.isEmpty, Permissions.shared.accessibility else { return }
        _ = TextSnippetService.postExpansion(deleteCount: 0,
                                             text: sanitized,
                                             trailingKeyCode: nil,
                                             trailingFlags: [])
    }

    private func message(for error: DictationSupport.TranscriptionError) -> String {
        let strings = FeatureStrings.dictation(L10n.shared.language)
        switch error {
        case .noKey: return strings.errorNoKey
        case .network: return strings.errorNetwork
        case .empty: return strings.errorEmpty
        case .parse: return strings.errorParse
        case .server(let text): return text.isEmpty ? strings.errorNetwork : text
        case .cancelled: return ""
        case .unavailable: return strings.errorEngineUnavailable
        }
    }
}
