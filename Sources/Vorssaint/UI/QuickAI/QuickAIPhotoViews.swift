// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import SwiftUI
import AppKit
import UniformTypeIdentifiers

/// Shared photo chips for the composer and the bubbles, plus the attach menu
/// that pastes, drops, or picks from clipboard history.
struct QuickAIPhotoThumb: View {
    let fileName: String
    var title: String = ""
    var size: CGFloat = 56
    var onRemove: (() -> Void)? = nil

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let image = QuickAIService.shared.previewImage(named: fileName) {
                    Image(nsImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    Image(systemName: "photo")
                        .font(.system(size: size * 0.32, weight: .medium))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.primary.opacity(0.06))
                }
            }
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            )
            .help(title)

            if let onRemove {
                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 13))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, Color.black.opacity(0.72))
                }
                .buttonStyle(.plain)
                .offset(x: 4, y: -4)
                .help(FeatureStrings.quickAI(L10n.shared.language).removePhoto)
            }
        }
    }
}

struct QuickAIPendingPhotos: View {
    @ObservedObject private var service = QuickAIService.shared
    var compact: Bool = false

    var body: some View {
        if !service.pendingImages.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(service.pendingImages) { photo in
                        QuickAIPhotoThumb(
                            fileName: photo.fileName,
                            title: photo.title,
                            size: compact ? 48 : 64
                        ) {
                            service.removePendingImage(photo.id)
                        }
                    }
                }
            }
        }
    }
}

struct QuickAIAttachMenu: View {
    @ObservedObject private var l10n = L10n.shared
    @ObservedObject private var service = QuickAIService.shared
    var compact: Bool = false

    private var strings: QuickAIFeatureStrings { FeatureStrings.quickAI(l10n.language) }
    private var history: [ClipboardHistoryEntry] { service.clipboardHistoryImages() }

    var body: some View {
        Menu {
            Button(strings.pastePhoto) {
                _ = service.pasteImagesFromPasteboard()
            }
            if !history.isEmpty {
                Menu(strings.fromClipboardHistory) {
                    ForEach(history) { entry in
                        Button {
                            _ = service.attachClipboardHistoryImage(entry.id)
                        } label: {
                            if !entry.text.isEmpty {
                                Text(entry.preview)
                            } else {
                                Text(entry.imageDimensionsLabel.isEmpty
                                     ? strings.photoAttached
                                     : entry.imageDimensionsLabel)
                            }
                        }
                    }
                }
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: compact ? 12 : 13, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: compact ? 24 : 28, height: compact ? 24 : 28)
                .background(
                    Circle().fill(Color.primary.opacity(0.08))
                )
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .help(strings.attachPhoto)
        .disabled(service.isSending
                  || service.pendingImages.count >= QuickAISupport.maximumImagesPerMessage)
    }
}
