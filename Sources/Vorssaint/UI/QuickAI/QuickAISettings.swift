// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import SwiftUI

/// Settings for Quick AI: the OpenAI key, the model, web search and the
/// Command Bar key. The key is a SecureField that writes the private store,
/// never a registered default.
struct QuickAISettings: View {
    @ObservedObject private var l10n = L10n.shared
    @ObservedObject private var service = QuickAIService.shared
    @State private var apiKey = ""
    @State private var didLoadKey = false
    @State private var testMessage: String?
    @State private var awaitingTest = false

    private var strings: QuickAIFeatureStrings { FeatureStrings.quickAI(l10n.language) }

    var body: some View {
        Form {
            Section {
                SecureField(strings.apiKeyLabel, text: $apiKey)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: apiKey) { _, value in
                        service.setAPIKey(value)
                        testMessage = nil
                    }
                Text(strings.apiKeyCaption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Picker(strings.modelLabel, selection: $service.model) {
                    ForEach(QuickAISupport.Model.allCases) { model in
                        Text(model.displayName).tag(model.rawValue)
                    }
                }
                Toggle(strings.webSearchLabel, isOn: $service.webSearch)
                Text(strings.webSearchCaption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } header: {
                Text(strings.pageTitle)
            } footer: {
                Text(strings.privacyCaption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section {
                Picker(strings.commandBarKeyLabel, selection: commandBarKeyBinding) {
                    Text(strings.commandBarKeyTab).tag(QuickAISupport.CommandBarKey.tab)
                    Text(strings.commandBarKeyGrave).tag(QuickAISupport.CommandBarKey.grave)
                    Text(strings.commandBarKeySlash).tag(QuickAISupport.CommandBarKey.slash)
                }
                Text(strings.commandBarKeyCaption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section {
                Button(strings.openChats) {
                    service.showWindow()
                }
                Button(strings.testConnection) {
                    test()
                }
                .disabled(!service.hasAPIKey || service.isSending)
                if let testMessage {
                    Text(testMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .onAppear {
            if !didLoadKey {
                apiKey = service.apiKey()
                didLoadKey = true
            }
        }
        .onChange(of: service.isSending) { _, sending in
            guard awaitingTest, !sending else { return }
            awaitingTest = false
            testMessage = service.lastError == nil ? strings.testSuccess : strings.testFailed
        }
    }

    private var commandBarKeyBinding: Binding<QuickAISupport.CommandBarKey> {
        Binding(
            get: { service.commandBarKey() },
            set: { service.setCommandBarKey($0) }
        )
    }

    private func test() {
        testMessage = nil
        awaitingTest = true
        service.resetDraft(keepingContext: false)
        service.send("Reply with the single word ok.", fromCommandBar: true)
        if !service.isSending {
            awaitingTest = false
            testMessage = strings.testFailed
        }
    }
}
