// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import SwiftUI

/// The longer chat window: sidebar of saved threads, a transcript, and a
/// field that keeps follow-ups in the same conversation.
struct QuickAIChatView: View {
    @ObservedObject private var l10n = L10n.shared
    @ObservedObject private var service = QuickAIService.shared
    @State private var draftText = ""

    private var strings: QuickAIFeatureStrings { FeatureStrings.quickAI(l10n.language) }

    var body: some View {
        NavigationSplitView {
            sidebar
                .frame(minWidth: 180)
        } detail: {
            VStack(spacing: 0) {
                toolbar
                Divider()
                transcript
                Divider()
                composer
            }
        }
        .frame(minWidth: 640, minHeight: 420)
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                service.resetDraft(keepingContext: false)
                draftText = ""
            } label: {
                Label(strings.newChat, systemImage: "plus")
            }
            .buttonStyle(.borderless)
            .padding(.horizontal, 12)
            .padding(.top, 10)

            if service.savedChats.isEmpty {
                Text(strings.emptyChats)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(12)
                Spacer()
            } else {
                List(service.savedChats, selection: chatSelection) { chat in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(chat.title.isEmpty ? strings.pageTitle : chat.title)
                            .lineLimit(1)
                        Text(chat.updatedAt, style: .relative)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    .contextMenu {
                        Button(strings.deleteChat, role: .destructive) {
                            service.deleteChat(chat.id)
                        }
                    }
                }
            }
        }
        .navigationTitle(strings.savedChats)
    }

    private var chatSelection: Binding<UUID?> {
        Binding(
            get: { service.selectedChatID },
            set: { id in
                if let id { service.loadChat(id) }
            }
        )
    }

    private var toolbar: some View {
        HStack(spacing: 10) {
            Picker(strings.modelLabel, selection: $service.model) {
                ForEach(QuickAISupport.Model.allCases) { model in
                    Text(model.displayName).tag(model.rawValue)
                }
            }
            .frame(maxWidth: 180)
            if !QuickAISupport.ReasoningEffort.options(for: service.model).isEmpty {
                Picker(strings.intensityLabel, selection: $service.reasoningEffort) {
                    ForEach(QuickAISupport.ReasoningEffort.allCases) { effort in
                        Text(effort.displayName).tag(effort.rawValue)
                    }
                }
                .frame(maxWidth: 140)
            }
            Toggle(service.webSearch ? strings.webSearchOn : strings.webSearchOff,
                   isOn: $service.webSearch)
                .toggleStyle(.checkbox)
            Spacer()
            Button(strings.copyResult) { service.copyLastAssistantReply() }
                .disabled(service.draft.messages.last(where: { $0.role == .assistant }) == nil)
            if !service.draft.messages.isEmpty {
                Button(strings.keepChat) { service.persistDraft() }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if !service.draft.contextNote.isEmpty {
                        Label(strings.attachedContext, systemImage: "text.cursor")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(service.draft.messages) { message in
                        messageBubble(message)
                            .id(message.id)
                    }
                    if service.isSending {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text(strings.generating)
                                .foregroundStyle(.secondary)
                        }
                    }
                    if let error = service.lastError {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
                .padding(16)
            }
            .onChange(of: service.draft.messages.count) { _, _ in
                if let last = service.draft.messages.last {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
    }

    private func messageBubble(_ message: QuickAISupport.Message) -> some View {
        let isUser = message.role == .user
        return HStack {
            if isUser { Spacer(minLength: 40) }
            Text(message.content)
                .font(.system(size: 13.5))
                .textSelection(.enabled)
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(isUser ? Color.accentColor.opacity(0.16) : Color.primary.opacity(0.06))
                )
            if !isUser { Spacer(minLength: 40) }
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField(strings.askPlaceholder, text: $draftText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...6)
                .disabled(service.isSending)
            Button(strings.send) { send() }
                .disabled(draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                          || service.isSending)
                .keyboardShortcut(.return, modifiers: [])
        }
        .padding(12)
    }

    private func send() {
        let text = draftText
        draftText = ""
        service.send(text, fromCommandBar: false)
    }
}
