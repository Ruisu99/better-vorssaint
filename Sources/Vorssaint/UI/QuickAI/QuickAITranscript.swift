// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import SwiftUI
import AppKit

/// Shared chat chrome for Quick AI: markdown laid out in blocks, a three-dot
/// wait animation, and a blinking caret while tokens arrive.
enum QuickAITranscript {
    static func isUser(_ message: QuickAISupport.Message) -> Bool {
        message.role == .user
    }
}

struct QuickAIMessageBubble: View {
    let message: QuickAISupport.Message
    var compact: Bool = false
    var isStreaming: Bool = false

    private var strings: QuickAIFeatureStrings { FeatureStrings.quickAI(L10n.shared.language) }

    var body: some View {
        let isUser = QuickAITranscript.isUser(message)
        HStack(alignment: .bottom, spacing: 8) {
            if isUser { Spacer(minLength: compact ? 40 : 56) }
            if !isUser {
                Image(systemName: "sparkle")
                    .font(.system(size: compact ? 10 : 11, weight: .semibold))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: compact ? 16 : 18)
                    .padding(.bottom, 6)
            }
            VStack(alignment: isUser ? .trailing : .leading, spacing: compact ? 6 : 8) {
                Group {
                    if message.content.isEmpty && isStreaming {
                        QuickAITypingDots()
                            .padding(.horizontal, compact ? 10 : 12)
                            .padding(.vertical, compact ? 8 : 10)
                    } else {
                        HStack(alignment: .bottom, spacing: 4) {
                            bubbleBody(isUser: isUser)
                            if isStreaming {
                                QuickAIStreamingCaret()
                                    .padding(.bottom, 2)
                            }
                        }
                        .padding(.horizontal, compact ? 12 : 14)
                        .padding(.vertical, compact ? 10 : 12)
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: compact ? 12 : 14, style: .continuous)
                        .fill(isUser
                              ? Color.accentColor.opacity(0.16)
                              : Color.primary.opacity(0.07))
                )
                if !isUser, !isStreaming, !message.content.isEmpty {
                    HStack(spacing: 12) {
                        Button(strings.copyResult) {
                            QuickAIService.shared.copyText(message.content)
                        }
                        Button(strings.insertReply) {
                            QuickAIService.shared.insertText(message.content)
                        }
                    }
                    .font(.system(size: compact ? 10 : 11, weight: .semibold))
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
                }
            }
            if !isUser { Spacer(minLength: compact ? 40 : 56) }
        }
    }

    @ViewBuilder
    private func bubbleBody(isUser: Bool) -> some View {
        if isUser {
            Text(QuickAISupport.formattedReply(message.content))
                .font(.system(size: compact ? 13 : 14))
                .multilineTextAlignment(.trailing)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            QuickAIReplyBlocks(text: message.content, compact: compact)
        }
    }
}

/// Assistant reply laid out as heading / paragraph / list / code chunks with
/// real gaps between them. A single Text(AttributedString) collapses those.
struct QuickAIReplyBlocks: View {
    let text: String
    var compact: Bool = false

    var body: some View {
        let blocks = QuickAISupport.replyBlocks(text)
        VStack(alignment: .leading, spacing: compact ? 8 : 11) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
    }

    @ViewBuilder
    private func blockView(_ block: QuickAISupport.ReplyBlock) -> some View {
        switch block {
        case .heading(let level, let text):
            Text(QuickAISupport.formattedReply(text))
                .font(.system(size: headingSize(level), weight: .semibold))
                .fixedSize(horizontal: false, vertical: true)
        case .paragraph(let text):
            Text(QuickAISupport.formattedReply(text))
                .font(.system(size: compact ? 13 : 14))
                .fixedSize(horizontal: false, vertical: true)
        case .bullets(let items):
            VStack(alignment: .leading, spacing: compact ? 5 : 7) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 8) {
                        Text("•")
                            .font(.system(size: compact ? 13 : 14, weight: .semibold))
                        Text(QuickAISupport.formattedReply(item))
                            .font(.system(size: compact ? 13 : 14))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        case .numbered(let items):
            VStack(alignment: .leading, spacing: compact ? 5 : 7) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .top, spacing: 8) {
                        Text("\(index + 1).")
                            .font(.system(size: compact ? 13 : 14, weight: .semibold))
                            .frame(minWidth: 16, alignment: .trailing)
                        Text(QuickAISupport.formattedReply(item))
                            .font(.system(size: compact ? 13 : 14))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        case .code(let text):
            Text(text.isEmpty ? " " : text)
                .font(.system(size: compact ? 12 : 13, design: .monospaced))
                .padding(compact ? 8 : 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color.primary.opacity(0.06))
                )
        case .quote(let text):
            HStack(alignment: .top, spacing: 8) {
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(Color.accentColor.opacity(0.7))
                    .frame(width: 2)
                Text(QuickAISupport.formattedReply(text))
                    .font(.system(size: compact ? 13 : 14))
                    .italic()
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func headingSize(_ level: Int) -> CGFloat {
        switch level {
        case 1: return compact ? 16 : 18
        case 2: return compact ? 15 : 16
        default: return compact ? 14 : 15
        }
    }
}

struct QuickAITypingDots: View {
    @State private var phase = 0

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.32)) { timeline in
            let step = Int(timeline.date.timeIntervalSinceReferenceDate / 0.32) % 3
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Color.secondary.opacity(step == index ? 0.95 : 0.28))
                        .frame(width: 6, height: 6)
                }
            }
            .accessibilityLabel(FeatureStrings.quickAI(L10n.shared.language).generating)
        }
    }
}

struct QuickAIStreamingCaret: View {
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { timeline in
            let on = Int(timeline.date.timeIntervalSinceReferenceDate / 0.5) % 2 == 0
            RoundedRectangle(cornerRadius: 0.5, style: .continuous)
                .fill(Color.accentColor)
                .frame(width: 1.6, height: 14)
                .opacity(on ? 1 : 0)
        }
        .accessibilityHidden(true)
    }
}
