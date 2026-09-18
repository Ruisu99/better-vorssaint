// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import SwiftUI
import UniformTypeIdentifiers

/// Compact floating chat, in the same family as the Command Bar: one glass
/// plate, the transcript, and a composer that takes photos as well as text.
struct QuickAIChatView: View {
    @ObservedObject private var l10n = L10n.shared
    @ObservedObject private var service = QuickAIService.shared
    @State private var draftText = ""
    @State private var isDropTargeted = false

    private var strings: QuickAIFeatureStrings { FeatureStrings.quickAI(l10n.language) }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().opacity(0.35)
            transcript
            composer
        }
        .frame(minWidth: 440, minHeight: 420)
        .background(HUDBackdrop(cornerRadius: CommandBarChrome.cornerRadius, contrast: .spotlight))
        .clipShape(RoundedRectangle(cornerRadius: CommandBarChrome.cornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: CommandBarChrome.cornerRadius, style: .continuous)
                .strokeBorder(isDropTargeted ? Color.accentColor.opacity(0.7) : Color.clear, lineWidth: 2)
        )
        .onDrop(of: QuickAIImageCodec.dropTypes, isTargeted: $isDropTargeted) { providers in
            service.attachDropProviders(providers)
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkle")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.accentColor)
            Text(strings.pageTitle)
                .font(.system(size: 13, weight: .semibold))
            Spacer(minLength: 8)
            Picker(strings.modelLabel, selection: $service.model) {
                ForEach(QuickAISupport.Model.allCases) { model in
                    Text(model.displayName).tag(model.rawValue)
                }
            }
            .labelsHidden()
            .frame(maxWidth: 150)
            if !QuickAISupport.ReasoningEffort.options(for: service.model).isEmpty {
                Picker(strings.intensityLabel, selection: $service.reasoningEffort) {
                    ForEach(QuickAISupport.ReasoningEffort.allCases) { effort in
                        Text(effort.displayName).tag(effort.rawValue)
                    }
                }
                .labelsHidden()
                .frame(maxWidth: 110)
            }
            Toggle(service.webSearch ? strings.webSearchOn : strings.webSearchOff,
                   isOn: $service.webSearch)
                .toggleStyle(.checkbox)
                .font(.caption)
            Menu {
                Button(strings.newChat) {
                    service.resetDraft(keepingContext: false)
                    draftText = ""
                }
                if !service.savedChats.isEmpty {
                    Divider()
                    ForEach(service.savedChats) { chat in
                        Button {
                            service.loadChat(chat.id)
                        } label: {
                            Text(chat.title.isEmpty ? strings.pageTitle : chat.title)
                        }
                    }
                }
                if service.selectedChatID != nil || !service.draft.messages.isEmpty {
                    Divider()
                    Button(strings.deleteChat, role: .destructive) {
                        service.deleteChat(service.draft.id)
                    }
                }
            } label: {
                Image(systemName: "clock")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
            .help(strings.savedChats)
            Button {
                service.hideWindow()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Color.primary.opacity(0.08)))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    if !service.draft.contextNote.isEmpty {
                        Label(strings.attachedContext, systemImage: "text.cursor")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(service.draft.messages) { message in
                        QuickAIMessageBubble(
                            message: message,
                            isStreaming: isStreaming(message)
                        )
                        .id(message.id)
                    }
                    if let error = service.lastError {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                    if service.draft.messages.isEmpty, service.lastError == nil, !service.isSending {
                        emptyState
                    }
                    Color.clear.frame(height: 1).id("quick-ai-end")
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
            }
            .onChange(of: service.draft.messages.count) { _, _ in
                proxy.scrollTo("quick-ai-end", anchor: .bottom)
            }
            .onChange(of: service.draft.messages.last?.content) { _, _ in
                proxy.scrollTo("quick-ai-end", anchor: .bottom)
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(strings.emptyChatHint)
                .font(.system(size: 13))
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
                chip(strings.thinkHarder, symbol: "lightbulb", selected: service.isThinkHarderOn) {
                    service.enableThinkHarder()
                }
            }
        }
        .font(.system(size: 12, weight: .semibold))
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider().opacity(0.35)
            if isDropTargeted {
                Text(strings.dropPhotoHint)
                    .font(.caption)
                    .foregroundStyle(Color.accentColor)
                    .padding(.horizontal, 4)
            }
            QuickAIPendingPhotos()
            HStack(alignment: .bottom, spacing: 8) {
                QuickAIAttachMenu()
                TextField(strings.askPlaceholder, text: $draftText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .lineLimit(1...8)
                    .disabled(service.isSending)
                Button(strings.send) { send() }
                    .disabled(!service.canSendComposer(draftText) || service.isSending)
                    .keyboardShortcut(.return, modifiers: [])
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
            }
            HStack(spacing: 12) {
                Button(strings.copyResult) { service.copyLastAssistantReply() }
                    .disabled(service.lastAssistantReply() == nil)
                Button(strings.insertReply) { service.insertLastAssistantReplyAtCaret() }
                    .disabled(service.isSending || service.lastAssistantReply() == nil)
                if !service.draft.messages.isEmpty {
                    Button(strings.keepChat) { service.persistDraft() }
                }
                Spacer()
            }
            .font(.system(size: 11, weight: .semibold))
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 14)
        .padding(.top, 8)
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

    private func send() {
        let text = draftText
        draftText = ""
        service.send(text, fromCommandBar: false)
    }
}
