// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AppKit
import Carbon.HIToolbox
import SwiftUI
import ApplicationServices

/// Quick AI: a Command Bar mode for fast follow-ups, and a window for chats
/// the person wants to keep. The OpenAI key never sits in UserDefaults.
final class QuickAIService: ObservableObject {
    static let shared = QuickAIService()

    @Published private(set) var draft = QuickAISupport.Chat()
    @Published private(set) var savedChats: [QuickAISupport.Chat] = []
    @Published private(set) var selectedChatID: UUID?
    @Published private(set) var isSending = false
    @Published private(set) var lastError: String?
    @Published private(set) var hasAPIKey = false
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
    @Published var reasoningEffort = QuickAISupport.defaultReasoningEffort {
        didSet {
            guard reasoningEffort != oldValue else { return }
            let sanitized = QuickAISupport.ReasoningEffort.sanitized(reasoningEffort).rawValue
            if sanitized != reasoningEffort { reasoningEffort = sanitized; return }
            UserDefaults.standard.set(sanitized, forKey: DefaultsKey.quickAIReasoningEffort)
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
        let context = keepingContext ? draft.contextNote : ""
        draft = QuickAISupport.Chat(model: model, webSearch: webSearch, contextNote: context)
        selectedChatID = nil
        lastError = nil
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

    // MARK: - Send

    func send(_ text: String, fromCommandBar: Bool) {
        guard AppFeature.quickAI.isAvailable else { return }
        guard !isSending else { return }
        let key = apiKey()
        guard QuickAISupport.hasAPIKey(key) else {
            lastError = FeatureStrings.quickAI(L10n.shared.language).noKey
            return
        }
        guard let next = QuickAISupport.appending(userText: text, to: draft) else {
            lastError = FeatureStrings.quickAI(L10n.shared.language).errorEmpty
            return
        }
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
                                                  reasoningEffort: self?.reasoningEffort
                                                    ?? QuickAISupport.defaultReasoningEffort) { assembled in
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
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(reply, forType: .string)
        QuickToolHUD.show(icon: "doc.on.doc",
                           message: FeatureStrings.quickAI(L10n.shared.language).copyResult)
    }

    /// Pastes the last reply into whichever app had the caret. From the
    /// Command Bar that is the app remembered when the bar opened; from the
    /// chat window it is whatever is frontmost after this window hides.
    func insertLastAssistantReplyAtCaret() {
        if CommandBarService.shared.isVisible {
            CommandBarService.shared.insertLastQuickAIReply()
            return
        }
        guard let reply = lastAssistantReply() else { return }
        guard AXIsProcessTrusted() else {
            Permissions.shared.requestAccessibility()
            return
        }
        hideWindow()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.16) {
            _ = TransientPaste.shared.paste(reply)
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
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 720, height: 520),
                              styleMask: [.titled, .closable, .resizable, .fullSizeContentView],
                              backing: .buffered,
                              defer: false)
        panel.title = FeatureStrings.quickAI(L10n.shared.language).pageTitle
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = false
        panel.level = .floating
        panel.titlebarAppearsTransparent = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.contentViewController = NSHostingController(rootView: QuickAIChatView())
        panel.delegate = CloseForwarder.shared
        CloseForwarder.shared.onClose = { [weak self] in self?.hideWindow() }
        self.panel = panel
        return panel
    }

    private func installKeyMonitor() {
        guard keyMonitor == nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard event.keyCode == UInt16(kVK_Escape),
                  event.modifierFlags.intersection([.command, .option, .control, .shift]).isEmpty,
                  let self, self.panel?.isKeyWindow == true
            else { return event }
            self.hideWindow()
            return nil
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
/// the window. The service stays the owner.
private final class CloseForwarder: NSObject, NSWindowDelegate {
    static let shared = CloseForwarder()
    var onClose: (() -> Void)?

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        onClose?()
        return false
    }
}
