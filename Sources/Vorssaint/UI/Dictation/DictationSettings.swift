// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import SwiftUI

/// Settings for Dictation: the hold key, the engine picker and each engine's
/// own small setup (an OpenAI key, or a Parakeet install check). No secret
/// ever becomes a registered default; the OpenAI key is a SecureField backed
/// by `DictationStore`, exactly like Quick AI's own key.
struct DictationSettings: View {
    @ObservedObject private var l10n = L10n.shared
    @ObservedObject private var permissions = Permissions.shared
    @ObservedObject private var service = DictationService.shared
    @AppStorage(DefaultsKey.dictationEnabled) private var enabled = false
    @AppStorage(DefaultsKey.dictationHoldKey) private var holdKeyRaw = DictationSupport.HoldKey.defaultKey.rawValue
    @AppStorage(DefaultsKey.dictationEngine) private var engineRaw = DictationSupport.Engine.defaultEngine.rawValue
    @AppStorage(DefaultsKey.dictationOpenAIModel) private var openAIModelRaw = DictationSupport.defaultOpenAIModel

    @State private var apiKey = ""
    @State private var didLoadKey = false
    @State private var parakeetAvailable = false
    @State private var didCheckParakeet = false

    private var strings: DictationFeatureStrings { FeatureStrings.dictation(l10n.language) }

    private var holdKey: DictationSupport.HoldKey { DictationSupport.HoldKey.sanitized(holdKeyRaw) }
    private var engine: DictationSupport.Engine { DictationSupport.Engine.sanitized(engineRaw) }
    private var hasQuickAIKey: Bool { QuickAISupport.hasAPIKey(QuickAIStore.loadAPIKey()) }

    var body: some View {
        Form {
            Section {
                Toggle(strings.enableToggle, isOn: $enabled)
                    .onChange(of: enabled) { _, value in
                        DictationService.shared.syncWithPreferences()
                        guard value else { return }
                        if !permissions.accessibility {
                            permissions.requestAccessibility()
                            permissions.openAccessibilitySettings()
                        }
                        if permissions.microphone != .granted {
                            permissions.requestMicrophone()
                        }
                    }
                Text(strings.enableCaption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Picker(strings.holdKeyLabel, selection: holdKeyBinding) {
                    ForEach(DictationSupport.HoldKey.allCases) { key in
                        Text(holdKeyName(key)).tag(key)
                    }
                }
                Text(strings.holdKeyCaption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if enabled, service.isRecording {
                    Label(strings.recording, systemImage: "waveform")
                        .font(.caption)
                        .foregroundStyle(.green)
                } else if enabled, service.isTranscribing {
                    Label(strings.transcribing, systemImage: "ellipsis.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if enabled, let error = service.lastError, !error.isEmpty {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            } header: {
                Text(strings.pageTitle)
            } footer: {
                Text(strings.privacyCaption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if enabled, !permissions.accessibility || permissions.microphone != .granted {
                Section(l10n.s.permissionRequired) {
                    if !permissions.accessibility {
                        PermissionRow(kind: .accessibility)
                    }
                    if permissions.microphone != .granted {
                        PermissionRow(kind: .microphone)
                    }
                }
            }

            Section(strings.engineLabel) {
                ForEach(DictationSupport.Engine.allCases) { candidate in
                    engineRow(candidate)
                }
                Text(strings.engineCaption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if engine == .openAI {
                Section {
                    SecureField(strings.apiKeyLabel, text: $apiKey)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: apiKey) { _, value in
                            DictationStore.saveAPIKey(value)
                        }
                    Text(strings.apiKeyCaption)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if apiKey.isEmpty, hasQuickAIKey {
                        Text(strings.apiKeyUsingQuickAI)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Picker(strings.openAIModelLabel, selection: openAIModelBinding) {
                        ForEach(DictationSupport.allowedOpenAIModels, id: \.self) { model in
                            Text(DictationSupport.openAIModelDisplayName(model)).tag(model)
                        }
                    }
                }
            }

            if engine == .parakeet {
                Section {
                    Text(strings.parakeetModelLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Label(parakeetAvailable ? strings.parakeetInstalled : strings.parakeetNotInstalled,
                          systemImage: parakeetAvailable ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                        .foregroundStyle(parakeetAvailable ? .green : .orange)
                    if !parakeetAvailable {
                        Text(strings.parakeetInstallHint)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Button(strings.parakeetCheckAgain) {
                        checkParakeet(forceRefresh: true)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .onAppear {
            if !didLoadKey {
                apiKey = DictationStore.loadAPIKey()
                didLoadKey = true
            }
            if !didCheckParakeet {
                checkParakeet(forceRefresh: false)
                didCheckParakeet = true
            }
        }
    }

    private func engineRow(_ candidate: DictationSupport.Engine) -> some View {
        let isDisabled = candidate == .parakeet && !parakeetAvailable
        let isSelected = engine == candidate
        return Button {
            guard !isDisabled else { return }
            engineRaw = candidate.rawValue
        } label: {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: isSelected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(engineName(candidate))
                        .foregroundStyle(isDisabled ? Color.secondary : Color.primary)
                    if isDisabled {
                        Text(strings.parakeetNotInstalled + " " + strings.parakeetInstallHint)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
    }

    private func engineName(_ candidate: DictationSupport.Engine) -> String {
        switch candidate {
        case .apple: return strings.engineApple
        case .openAI: return strings.engineOpenAI
        case .parakeet: return strings.engineParakeet
        }
    }

    private func holdKeyName(_ key: DictationSupport.HoldKey) -> String {
        switch key {
        case .rightOption: return strings.holdKeyRightOption
        case .leftOption: return strings.holdKeyLeftOption
        case .rightCommand: return strings.holdKeyRightCommand
        case .rightControl: return strings.holdKeyRightControl
        case .rightShift: return strings.holdKeyRightShift
        }
    }

    private var holdKeyBinding: Binding<DictationSupport.HoldKey> {
        Binding {
            holdKey
        } set: { key in
            holdKeyRaw = key.rawValue
            DictationService.shared.syncWithPreferences()
        }
    }

    private var openAIModelBinding: Binding<String> {
        Binding {
            DictationSupport.sanitizedOpenAIModel(openAIModelRaw)
        } set: { model in
            openAIModelRaw = model
        }
    }

    private func checkParakeet(forceRefresh: Bool) {
        if forceRefresh { DictationParakeetRunner.invalidateAvailabilityCache() }
        Task { @MainActor in
            let available = await Task.detached(priority: .utility) {
                DictationParakeetRunner.isAvailable()
            }.value
            parakeetAvailable = available
            if !available, engine == .parakeet {
                engineRaw = DictationSupport.Engine.defaultEngine.rawValue
            }
        }
    }
}
