// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AppKit
import Carbon.HIToolbox
import SwiftUI
import ApplicationServices
import UniformTypeIdentifiers

/// Quick AI: a Command Bar mode for fast follow-ups, and a window for chats
/// the person wants to keep. The OpenAI key never sits in UserDefaults.
final class QuickAIService: ObservableObject {
    static let shared = QuickAIService()
    static let windowSize = NSSize(width: CommandBarChrome.width, height: 640)

    struct PendingImage: Identifiable, Equatable {
        var id: UUID
        var fileName: String
        var title: String
        var width: Int
        var height: Int
    }

    @Published private(set) var draft = QuickAISupport.Chat()
    @Published private(set) var savedChats: [QuickAISupport.Chat] = []
    @Published private(set) var selectedChatID: UUID?
    @Published private(set) var isSending = false
    @Published private(set) var lastError: String?
    @Published private(set) var hasAPIKey = false
    @Published private(set) var pendingImages: [PendingImage] = []
    /// When a Command Bar selection action turns web search on for one session,
    /// that must not rewrite the person's saved preference.
    private var persistWebSearchPreference = true
    @Published var webSearch = false {
        didSet {
            guard webSearch != oldValue else { return }
            if persistWebSearchPreference {
                UserDefaults.standard.set(webSearch, forKey: DefaultsKey.quickAIWebSearch)
            }
            draft.webSearch = webSearch
        }
    }
    @Published var model = QuickAISupport.defaultModel {
        didSet {
            guard model != oldValue else { return }
            let sanitized = QuickAISupport.Model.sanitized(model)
            if sanitized != model { model = sanitized; return }
            UserDefaults.standard.set(sanitized, forKey: DefaultsKey.quickAIModel)
            draft.model = sanitized
            if !QuickAISupport.Model.supportsReasoning(sanitized),
               reasoningEffort != QuickAISupport.defaultReasoningEffort {
                reasoningEffort = QuickAISupport.defaultReasoningEffort
            }
        }
    }
    private var persistReasoningPreference = true
    @Published var reasoningEffort = QuickAISupport.defaultReasoningEffort {
        didSet {
            guard reasoningEffort != oldValue else { return }
            let sanitized = QuickAISupport.ReasoningEffort.sanitized(reasoningEffort).rawValue
            if sanitized != reasoningEffort { reasoningEffort = sanitized; return }
            if persistReasoningPreference {
                UserDefaults.standard.set(sanitized, forKey: DefaultsKey.quickAIReasoningEffort)
            }
        }
    }

    private var sendTask: Task<Void, Never>?
    private var sendGeneration = 0
    private var panel: NSPanel?
    private var keyMonitor: Any?

    private init() {
        let defaults = UserDefaults.standard
        webSearch = defaults.bool(forKey: DefaultsKey.quickAIWebSearch)
        model = QuickAISupport.Model.sanitized(defaults.string(forKey: DefaultsKey.quickAIModel))
        reasoningEffort = QuickAISupport.ReasoningEffort.sanitized(
            defaults.string(forKey: DefaultsKey.quickAIReasoningEffort)).rawValue
        savedChats = QuickAIStore.loadChats()
        hasAPIKey = QuickAISupport.hasAPIKey(QuickAIStore.loadAPIKey())
        resetDraft(keepingContext: false)
    }

    func syncWithPreferences() {
        hasAPIKey = QuickAISupport.hasAPIKey(QuickAIStore.loadAPIKey())
        if !AppFeature.quickAI.isAvailable {
            cancel()
            hideWindow()
            CommandBarService.shared.leaveQuickAI()
        }
    }

    func apiKey() -> String { QuickAIStore.loadAPIKey() }

    func setAPIKey(_ raw: String) {
        _ = QuickAIStore.saveAPIKey(raw)
        hasAPIKey = QuickAISupport.hasAPIKey(raw)
    }

    func commandBarKey() -> QuickAISupport.CommandBarKey {
        QuickAISupport.CommandBarKey.sanitized(
            UserDefaults.standard.string(forKey: DefaultsKey.quickAICommandBarKey))
    }

    func setCommandBarKey(_ key: QuickAISupport.CommandBarKey) {
        UserDefaults.standard.set(key.rawValue, forKey: DefaultsKey.quickAICommandBarKey)
    }

    // MARK: - Draft

    func resetDraft(keepingContext: Bool) {
        clearPendingImages()
        QuickAIStore.sweepImages(keeping: savedChats)
        let context = keepingContext ? draft.contextNote : ""
        draft = QuickAISupport.Chat(model: model, webSearch: webSearch, contextNote: context)
        selectedChatID = nil
        lastError = nil
    }

    func canSendComposer(_ text: String) -> Bool {
        QuickAISupport.canSend(text: text, imageCount: pendingImages.count)
    }

    func previewImage(named fileName: String) -> NSImage? {
        guard let data = QuickAIStore.loadImageData(named: fileName) else { return nil }
        return NSImage(data: data)
    }

    func clipboardHistoryImages() -> [ClipboardHistoryEntry] {
        guard AppFeature.clipboardHistory.isAvailable else { return [] }
        return Array(ClipboardHistoryService.shared.entries
            .filter { $0.kind == .image }
            .prefix(12))
    }

    @discardableResult
    func pasteImagesFromPasteboard(_ pasteboard: NSPasteboard = .general) -> Bool {
        let images = QuickAIImageCodec.images(from: pasteboard)
        guard !images.isEmpty else { return false }
        var attached = false
        for image in images {
            if attachPrepared(image) { attached = true }
        }
        return attached
    }

    @discardableResult
    func attachClipboardHistoryImage(_ id: UUID) -> Bool {
        guard let entry = ClipboardHistoryService.shared.entries.first(where: { $0.id == id }),
              entry.kind == .image,
              let name = entry.imageFile,
              let data = ClipboardImageStore.imageData(named: name)
        else { return false }
        let title = ClipboardHistoryCaptureSupport.imageTitle(from: entry.text)
            ?? (entry.text.isEmpty ? entry.imageDimensionsLabel : entry.text)
        return attachImageData(data, title: title)
    }

    @discardableResult
    func attachImageData(_ data: Data, title: String?) -> Bool {
        guard let prepared = QuickAIImageCodec.prepare(data: data, title: title ?? "") else {
            lastError = FeatureStrings.quickAI(L10n.shared.language).errorNoPhoto
            return false
        }
        return attachPrepared(prepared)
    }

    @discardableResult
    func attachFileURL(_ url: URL) -> Bool {
        guard let prepared = QuickAIImageCodec.prepare(fileURL: url) else {
            lastError = FeatureStrings.quickAI(L10n.shared.language).errorNoPhoto
            return false
        }
        return attachPrepared(prepared)
    }

    @discardableResult
    func attachDropProviders(_ providers: [NSItemProvider]) -> Bool {
        if pasteImagesFromPasteboard(NSPasteboard(name: .drag)) { return true }
        var accepted = false
        for provider in providers.prefix(QuickAISupport.maximumImagesPerMessage) {
            if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                accepted = true
                provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] data, _ in
                    guard let data else { return }
                    DispatchQueue.main.async {
                        _ = self?.attachImageData(data, title: nil)
                    }
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                accepted = true
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { [weak self] item, _ in
                    let url: URL?
                    if let value = item as? URL {
                        url = value
                    } else if let data = item as? Data {
                        url = URL(dataRepresentation: data, relativeTo: nil)
                    } else {
                        url = nil
                    }
                    guard let url else { return }
                    DispatchQueue.main.async {
                        _ = self?.attachFileURL(url)
                    }
                }
            }
        }
        return accepted
    }

    func removePendingImage(_ id: UUID) {
        guard let index = pendingImages.firstIndex(where: { $0.id == id }) else { return }
        QuickAIStore.deleteImage(named: pendingImages[index].fileName)
        pendingImages.remove(at: index)
    }

    func clearPendingImages() {
        for image in pendingImages {
            QuickAIStore.deleteImage(named: image.fileName)
        }
        pendingImages = []
    }

    func stepSavedChat(_ delta: Int) {
        if !draft.messages.isEmpty { persistDraft() }
        let chats = savedChats
        guard !chats.isEmpty else { return }
        let current = selectedChatID ?? draft.id
        guard let index = chats.firstIndex(where: { $0.id == current }) else {
            if let first = chats.first { loadChat(first.id) }
            return
        }
        let next = (index + delta % chats.count + chats.count) % chats.count
        loadChat(chats[next].id)
    }

    @discardableResult
    private func attachPrepared(_ prepared: QuickAIImageCodec.Prepared) -> Bool {
        guard pendingImages.count < QuickAISupport.maximumImagesPerMessage else { return false }
        let fileName = UUID().uuidString + ".jpeg"
        guard QuickAIStore.saveImageData(prepared.data, fileName: fileName) != nil else {
            lastError = FeatureStrings.quickAI(L10n.shared.language).errorNoPhoto
            return false
        }
        pendingImages.append(PendingImage(id: UUID(),
                                          fileName: fileName,
                                          title: prepared.title,
                                          width: prepared.width,
                                          height: prepared.height))
        lastError = nil
        return true
    }

    private func pendingAttachments() -> [QuickAISupport.ImageAttachment] {
        pendingImages.map {
            QuickAISupport.ImageAttachment(id: $0.id,
                                           fileName: $0.fileName,
                                           mimeType: "image/jpeg",
                                           width: $0.width,
                                           height: $0.height,
                                           title: $0.title)
        }
    }

    func attachContext(_ text: String) {
        draft.contextNote = QuickAISupport.clipped(text)
    }

    func prepareCommandBarSession(selection: String, webSearch sessionWebSearch: Bool? = nil) {
        cancel()
        let preferred = UserDefaults.standard.bool(forKey: DefaultsKey.quickAIWebSearch)
        applySessionWebSearch(sessionWebSearch ?? preferred)
        resetDraft(keepingContext: false)
        attachContext(QuickAISupport.resolvedContext(selection: selection))
        if !hasAPIKey {
            lastError = FeatureStrings.quickAI(L10n.shared.language).noKey
        }
    }

    private func applySessionWebSearch(_ on: Bool) {
        guard webSearch != on else { return }
        persistWebSearchPreference = false
        webSearch = on
        persistWebSearchPreference = true
    }

    private func applySessionReasoning(_ raw: String) {
        let next = QuickAISupport.ReasoningEffort.sanitized(raw).rawValue
        guard reasoningEffort != next else { return }
        persistReasoningPreference = false
        reasoningEffort = next
        persistReasoningPreference = true
    }

    func enableResearchMode() {
        applySessionWebSearch(true)
        applySessionReasoning(QuickAISupport.reasoningEffortForSend("research", current: reasoningEffort))
    }

    var isThinkHarderOn: Bool {
        let effort = QuickAISupport.ReasoningEffort.sanitized(reasoningEffort)
        return effort == .xhigh || effort == .max
    }

    func enableThinkHarder() {
        if isThinkHarderOn {
            applySessionReasoning(QuickAISupport.defaultReasoningEffort)
        } else {
            applySessionReasoning(QuickAISupport.ReasoningEffort.xhigh.rawValue)
        }
    }

    /// Runs a Command Bar selection action against the attached text. Used
    /// once Quick AI is already open, where the catalog row would refuse.
    func runSelectionAction(_ action: QuickAISupport.SelectionAction) {
        let selection = draft.contextNote.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !selection.isEmpty else { return }
        if action.usesWebSearch { applySessionWebSearch(true) }
        send(action.userPrompt(for: selection, includeSelection: false), fromCommandBar: true)
    }

    // MARK: - Send

    func send(_ text: String, fromCommandBar: Bool) {
        guard AppFeature.quickAI.isAvailable else { return }
        guard !isSending else { return }
        let key = apiKey()
        guard QuickAISupport.hasAPIKey(key) else {
            lastError = FeatureStrings.quickAI(L10n.shared.language).noKey
            return
        }
        let photos = pendingAttachments()
        guard QuickAISupport.canSend(text: text, imageCount: photos.count) else {
            lastError = FeatureStrings.quickAI(L10n.shared.language).errorEmpty
            return
        }
        if QuickAISupport.needsWebSearch(text) {
            applySessionWebSearch(true)
        }
        applySessionReasoning(QuickAISupport.reasoningEffortForSend(text, current: reasoningEffort))
        let effort = reasoningEffort
        guard let next = QuickAISupport.appending(userText: text, images: photos, to: draft) else {
            lastError = FeatureStrings.quickAI(L10n.shared.language).errorEmpty
            return
        }
        pendingImages = []
        draft = next
        lastError = nil
        isSending = true
        sendGeneration += 1
        let generation = sendGeneration
        let language = L10n.shared.language.rawValue
        draft = QuickAISupport.appendingStreamingPlaceholder(to: next)
        let chat = next
        sendTask?.cancel()
        sendTask = Task { [weak self] in
            let result = await QuickAIClient.send(chat: chat,
                                                  apiKey: key,
                                                  languageCode: language,
                                                  reasoningEffort: effort) { assembled in
                await MainActor.run {
                    guard let self, generation == self.sendGeneration else { return }
                    self.draft = QuickAISupport.replacingLastAssistant(assembled, in: self.draft)
                }
            }
            await MainActor.run {
                guard let self, generation == self.sendGeneration else { return }
                self.isSending = false
                self.sendTask = nil
                switch result {
                case .success(let reply):
                    self.draft = QuickAISupport.replacingLastAssistant(reply, in: self.draft)
                    if !fromCommandBar {
                        self.persistDraft()
                    }
                case .failure(.cancelled):
                    self.draft = QuickAISupport.droppingTrailingEmptyAssistant(self.draft)
                case .failure(let error):
                    self.draft = QuickAISupport.droppingTrailingEmptyAssistant(self.draft)
                    self.lastError = self.message(for: error)
                }
            }
        }
    }

    func cancel() {
        sendGeneration += 1
        sendTask?.cancel()
        sendTask = nil
        isSending = false
    }

    func persistDraft() {
        guard !draft.messages.isEmpty else { return }
        savedChats = QuickAIStore.upsert(draft, in: savedChats)
        selectedChatID = draft.id
        _ = QuickAIStore.saveChats(savedChats)
    }

    func loadChat(_ id: UUID) {
        cancel()
        clearPendingImages()
        QuickAIStore.sweepImages(keeping: savedChats)
        guard let chat = savedChats.first(where: { $0.id == id }) else { return }
        draft = chat
        selectedChatID = id
        webSearch = chat.webSearch
        model = chat.model
        lastError = nil
    }

    func deleteChat(_ id: UUID) {
        savedChats.removeAll { $0.id == id }
        _ = QuickAIStore.saveChats(savedChats)
        if draft.id == id {
            resetDraft(keepingContext: false)
            selectedChatID = nil
        }
    }

    func lastAssistantReply() -> String? {
        QuickAISupport.lastAssistantReply(in: draft)
    }

    func copyLastAssistantReply() {
        guard let reply = lastAssistantReply() else { return }
        copyText(reply)
    }

    func copyText(_ text: String) {
        let clipped = QuickAISupport.clipped(text)
        guard !clipped.isEmpty else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(clipped, forType: .string)
        QuickToolHUD.show(icon: "doc.on.doc",
                           message: FeatureStrings.quickAI(L10n.shared.language).copyResult)
    }

    /// Pastes a reply into whichever app had the caret. From the Command Bar
    /// that is the app remembered when the bar opened; from the chat window
    /// it is whatever is frontmost after this window hides.
    func insertLastAssistantReplyAtCaret() {
        guard let reply = lastAssistantReply() else { return }
        insertText(reply)
    }

    func insertText(_ text: String) {
        let clipped = QuickAISupport.clipped(text)
        guard !clipped.isEmpty else { return }
        if CommandBarService.shared.isVisible {
            CommandBarService.shared.insertQuickAIText(clipped)
            return
        }
        guard AXIsProcessTrusted() else {
            Permissions.shared.requestAccessibility()
            return
        }
        hideWindow()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.16) {
            _ = TransientPaste.shared.paste(clipped)
        }
    }

    // MARK: - Window

    var isWindowVisible: Bool { panel?.isVisible == true }

    func showWindow() {
        guard AppFeature.quickAI.isAvailable else { return }
        let panel = ensurePanel()
        if savedChats.isEmpty, draft.messages.isEmpty {
            resetDraft(keepingContext: false)
        } else if selectedChatID == nil, let first = savedChats.first {
            loadChat(first.id)
        }
        if !NSScreen.screens.contains(where: { $0.visibleFrame.intersects(panel.frame) }) {
            center(panel)
        }
        panel.alphaValue = 0.02
        panel.orderFrontRegardless()
        panel.makeKeyAndOrderFront(nil)
        installKeyMonitor()
        NSApp.activate(ignoringOtherApps: true)
        panel.displayIfNeeded()
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.13
            panel.animator().alphaValue = 1
        }, completionHandler: { [weak panel] in
            panel?.alphaValue = 1
            panel?.displayIfNeeded()
        })
    }

    func hideWindow() {
        cancel()
        if let monitor = keyMonitor {
            NSEvent.removeMonitor(monitor)
            keyMonitor = nil
        }
        panel?.orderOut(nil)
    }

    func toggleWindow() {
        if isWindowVisible { hideWindow() } else { showWindow() }
    }

    func keepAndOpenWindow() {
        persistDraft()
        CommandBarService.shared.hide()
        showWindow()
    }

    private func ensurePanel() -> NSPanel {
        if let panel { return panel }
        let panel = KeyableQuickAIPanel(contentRect: NSRect(origin: .zero, size: Self.windowSize),
                                        styleMask: [.borderless, .resizable],
                                        backing: .buffered,
                                        defer: false)
        panel.title = FeatureStrings.quickAI(L10n.shared.language).pageTitle
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = false
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isMovableByWindowBackground = true
        panel.minSize = NSSize(width: 440, height: 420)
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        let host = NSHostingController(rootView: QuickAIChatView())
        host.sizingOptions = []
        host.view.wantsLayer = true
        host.view.layer?.backgroundColor = NSColor.clear.cgColor
        host.view.layer?.isOpaque = false
        panel.contentViewController = host
        panel.setContentSize(Self.windowSize)
        panel.delegate = CloseForwarder.shared
        CloseForwarder.shared.onClose = { [weak self] in self?.hideWindow() }
        self.panel = panel
        return panel
    }

    private func installKeyMonitor() {
        guard keyMonitor == nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.panel?.isKeyWindow == true else { return event }
            let modifiers = event.modifierFlags.intersection([.command, .option, .control, .shift])
            if event.keyCode == UInt16(kVK_Escape), modifiers.isEmpty {
                self.hideWindow()
                return nil
            }
            if modifiers == [.command] {
                switch event.charactersIgnoringModifiers?.lowercased() {
                case "v":
                    if self.pasteImagesFromPasteboard() { return nil }
                case "n":
                    self.resetDraft(keepingContext: false)
                    return nil
                case "[":
                    self.stepSavedChat(-1)
                    return nil
                case "]":
                    self.stepSavedChat(1)
                    return nil
                default:
                    break
                }
            }
            return event
        }
    }

    private func center(_ panel: NSPanel) {
        let screen = NSScreen.pointerVisibleFrame
        let size = panel.frame.size
        panel.setFrame(NSRect(x: screen.midX - size.width / 2,
                              y: screen.midY - size.height / 2,
                              width: size.width,
                              height: size.height),
                       display: true)
    }

    private func message(for error: QuickAISupport.SendError) -> String {
        let strings = FeatureStrings.quickAI(L10n.shared.language)
        switch error {
        case .noKey: return strings.errorNoKey
        case .noText: return strings.errorEmpty
        case .network: return strings.errorNetwork
        case .empty: return strings.errorEmpty
        case .parse: return strings.errorParse
        case .server(let text): return text
        case .cancelled: return ""
        }
    }
}

/// NSPanel needs a delegate to swallow the red close button without destroying
/// the window. The service stays the owner. Borderless panels also refuse key
/// status unless we say otherwise, and the composer needs it for typing.
private final class KeyableQuickAIPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

private final class CloseForwarder: NSObject, NSWindowDelegate {
    static let shared = CloseForwarder()
    var onClose: (() -> Void)?

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        onClose?()
        return false
    }
}
