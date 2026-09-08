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
                chip(strings.thinkHarder, symbol: "lightbulb",
                     selected: service.isThinkHarderOn) {
                    service.enableThinkHarder()
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            if service.draft.messages.isEmpty, service.lastError == nil, !service.isSending {
                VStack(alignment: .leading, spacing: 8) {
                    Text(strings.followUpHint)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                    if !service.draft.contextNote.isEmpty {
                        HStack(spacing: 8) {
                            chip(strings.selectionImprove, symbol: "wand.and.stars") {
                                service.runSelectionAction(.improve)
                            }
                            chip(strings.selectionSummarize, symbol: "doc.text") {
                                service.runSelectionAction(.summarize)
                            }
                            chip(strings.selectionTranslate, symbol: "character.book.closed") {
                                service.runSelectionAction(.translate)
                            }
                        }
                    }
                    HStack(spacing: 8) {
                        chip(strings.researchThisQuestion, symbol: "globe") {
                            service.enableResearchMode()
                        }
                    }
                    Text(strings.insertWithCommandReturn)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 14) {
                            ForEach(service.draft.messages) { message in
                                QuickAIMessageBubble(
                                    message: message,
                                    compact: true,
                                    isStreaming: isStreaming(message)
                                )
                                .id(message.id)
                            }
                            if let error = service.lastError {
                                Text(error)
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                            Color.clear.frame(height: 1).id("quick-ai-bar-end")
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                    }
                    .frame(maxHeight: 300)
                    .onChange(of: service.draft.messages.count) { _, _ in
                        proxy.scrollTo("quick-ai-bar-end", anchor: .bottom)
                        CommandBarService.shared.refreshPanelLayout()
                    }
                    .onChange(of: service.draft.messages.last?.content) { _, _ in
                        proxy.scrollTo("quick-ai-bar-end", anchor: .bottom)
                        CommandBarService.shared.refreshPanelLayout()
                    }
                }
            }

            HStack(spacing: 10) {
                Button(strings.keepChat) { service.persistDraft() }
                    .disabled(service.draft.messages.isEmpty)
                Button(strings.openChats) { service.keepAndOpenWindow() }
                Button(strings.copyResult) { service.copyLastAssistantReply() }
                    .disabled(service.lastAssistantReply() == nil)
                Button(strings.insertReply) {
                    service.insertLastAssistantReplyAtCaret()
                }
                .disabled(service.isSending || service.lastAssistantReply() == nil)
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

    private func chip(_ title: String, symbol: String, selected: Bool = false,
                      action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.system(size: 11, weight: .semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .foregroundStyle(selected ? Color.accentColor : Color.primary)
                .background(
                    Capsule(style: .continuous)
                        .fill(selected
                              ? Color.accentColor.opacity(0.16)
                              : Color.primary.opacity(0.08))
                )
        }
        .buttonStyle(.plain)
    }

    private func isStreaming(_ message: QuickAISupport.Message) -> Bool {
        service.isSending
            && message.role == .assistant
            && message.id == service.draft.messages.last(where: { $0.role == .assistant })?.id
    }
}
