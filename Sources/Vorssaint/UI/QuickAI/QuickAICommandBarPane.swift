// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import SwiftUI

/// The Command Bar's Quick AI face: the same field, a short transcript, and
/// keys for follow-ups, keep, and the longer window.
struct QuickAICommandBarPane: View {
    @ObservedObject private var l10n = L10n.shared
    @ObservedObject private var service = QuickAIService.shared

    private var strings: QuickAIFeatureStrings { FeatureStrings.quickAI(l10n.language) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "sparkle")
                    .foregroundStyle(Color.accentColor)
                Text(strings.pageTitle)
                    .font(.system(size: 12, weight: .semibold))
                Spacer()
                if !service.draft.contextNote.isEmpty {
                    Text(strings.attachedContext)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Toggle(service.webSearch ? strings.webSearchOn : strings.webSearchOff,
                       isOn: $service.webSearch)
                    .toggleStyle(.checkbox)
                    .font(.caption)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            if service.draft.messages.isEmpty, service.lastError == nil, !service.isSending {
                Text(strings.followUpHint)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(service.draft.messages) { message in
                                bubble(message).id(message.id)
                            }
                            if service.isSending {
                                HStack(spacing: 6) {
                                    ProgressView().controlSize(.mini)
                                    Text(strings.generating)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            if let error = service.lastError {
                                Text(error)
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                    }
                    .frame(maxHeight: 280)
                    .onChange(of: service.draft.messages.count) { _, _ in
                        if let last = service.draft.messages.last {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            HStack(spacing: 10) {
                Button(strings.keepChat) { service.persistDraft() }
                    .disabled(service.draft.messages.isEmpty)
                Button(strings.openChats) { service.keepAndOpenWindow() }
                Button(strings.copyResult) { service.copyLastAssistantReply() }
                    .disabled(service.draft.messages.last(where: { $0.role == .assistant }) == nil)
                Spacer()
                Button(strings.newChat) {
                    service.resetDraft(keepingContext: true)
                }
            }
            .font(.system(size: 11, weight: .semibold))
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
    }

    private func bubble(_ message: QuickAISupport.Message) -> some View {
        let isUser = message.role == .user
        return HStack {
            if isUser { Spacer(minLength: 48) }
            Text(message.content)
                .font(.system(size: 13))
                .textSelection(.enabled)
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(isUser ? Color.accentColor.opacity(0.14) : Color.primary.opacity(0.06))
                )
            if !isUser { Spacer(minLength: 48) }
        }
    }
}
