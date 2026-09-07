// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import SwiftUI
import AppKit

/// Shared chat chrome for Quick AI: markdown bubbles, a three-dot wait
/// animation, and a blinking caret while tokens arrive.
enum QuickAITranscript {
    static func isUser(_ message: QuickAISupport.Message) -> Bool {
        message.role == .user
    }
}

struct QuickAIMessageBubble: View {
    let message: QuickAISupport.Message
    var compact: Bool = false
    var isStreaming: Bool = false

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
            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                if message.content.isEmpty && isStreaming {
                    QuickAITypingDots()
                        .padding(.horizontal, compact ? 10 : 12)
                        .padding(.vertical, compact ? 8 : 10)
                } else {
                    HStack(alignment: .bottom, spacing: 4) {
                        Text(Self.displayReply(message.content, compact: compact))
                            .font(.system(size: compact ? 13 : 14))
                            .multilineTextAlignment(isUser ? .trailing : .leading)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
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
            if !isUser { Spacer(minLength: compact ? 40 : 56) }
        }
    }

    /// Markdown with real paragraph gaps. SwiftUI's default AttributedString
    /// rendering collapses those into one block, which is what people notice
    /// first when they come from Raycast or ChatGPT.
    private static func displayReply(_ raw: String, compact: Bool) -> AttributedString {
        var attributed = QuickAISupport.formattedReply(raw)
        let style = NSMutableParagraphStyle()
        style.paragraphSpacing = compact ? 8 : 11
        style.lineSpacing = compact ? 3 : 4
        style.lineBreakMode = .byWordWrapping
        var container = AttributeContainer()
        container.paragraphStyle = style
        attributed.mergeAttributes(container)
        return attributed
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
