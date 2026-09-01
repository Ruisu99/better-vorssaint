// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import AppKit
import Foundation

/// Moves prefs and Application Support from the earlier fork install that still
/// used Vorssaint's bundle id, then retires leftover Vorssaint.app copies so
/// two menu-bar icons never fight for the same hotkeys.
enum ForkIdentityMigration {
    private static let migratedKey = "betterVorssaintMigratedFromLegacyFork"

    static func runAtLaunch() {
        guard AppInfo.isPersonalFork else { return }
        migrateLegacyDataIfNeeded()
        // Official auto-updates would replace this fork with upstream.
        if UserDefaults.standard.object(forKey: DefaultsKey.autoCheckUpdates) == nil {
            UserDefaults.standard.set(false, forKey: DefaultsKey.autoCheckUpdates)
        }
        retireLegacyApps()
    }

    // MARK: - Prefs + files

    private static func migrateLegacyDataIfNeeded() {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: migratedKey) else { return }
        defer { defaults.set(true, forKey: migratedKey) }

        // Fresh fork install: no onboarding flag yet. Copy from the old domain
        // so the OpenAI key path, feature toggles and history keep working.
        let looksFresh = defaults.object(forKey: DefaultsKey.hasOnboarded) == nil
        guard looksFresh else { return }

        for legacyID in AppInfo.legacyForkBundleIDs {
            guard let legacy = UserDefaults(suiteName: legacyID) else { continue }
            let dictionary = legacy.dictionaryRepresentation()
            guard dictionary[DefaultsKey.hasOnboarded] != nil
                    || dictionary[DefaultsKey.clipboardHistoryEnabled] != nil
                    || dictionary[DefaultsKey.quickAIModel] != nil
            else { continue }
            for (key, value) in dictionary {
                // Suite metadata and Apple keys stay out of the new domain.
                if key.hasPrefix("Apple") || key.hasPrefix("NS") || key.hasPrefix("com.apple.") {
                    continue
                }
                if defaults.object(forKey: key) == nil {
                    defaults.set(value, forKey: key)
                }
            }
            migrateApplicationSupport(from: legacyID)
            break
        }
    }

    private static func migrateApplicationSupport(from legacyID: String) {
        let manager = FileManager.default
        guard let base = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first,
              let newID = Bundle.main.bundleIdentifier
        else { return }
        let source = base.appendingPathComponent(legacyID, isDirectory: true)
        let destination = base.appendingPathComponent(newID, isDirectory: true)
        guard manager.fileExists(atPath: source.path) else { return }
        if manager.fileExists(atPath: destination.path) {
            // Destination already has content (e.g. a partial first run). Leave it.
            let contents = (try? manager.contentsOfDirectory(atPath: destination.path)) ?? []
            if !contents.isEmpty { return }
            try? manager.removeItem(at: destination)
        }
        try? manager.copyItem(at: source, to: destination)
        PrivateFileStore.createDirectory(at: destination)
    }

    // MARK: - Retire old apps

    /// Quits and trashes leftover fork copies that would put a second icon in
    /// the menu bar. Official Vorssaint (`com.vorssaint.utils` without our
    /// fork marker) is left alone so it can coexist beside Better Vorssaint.
    /// The installer still removes a previous in-place fork install at
    /// `/Applications/Vorssaint.app` during updates.
    private static func retireLegacyApps() {
        let running = Bundle.main.bundleURL.resolvingSymlinksInPath().standardizedFileURL.path
        let candidates = [
            "/Applications/Vorssaint.app",
            "/Applications/Vorssaint (Developer).app",
            "/Applications/Vorssaint Utils.app",
            "/Applications/Better Vorssaint (Developer).app",
        ]
        for path in candidates {
            let url = URL(fileURLWithPath: path)
            let candidatePath = url.resolvingSymlinksInPath().standardizedFileURL.path
            guard candidatePath != running,
                  FileManager.default.fileExists(atPath: path),
                  shouldRetire(url)
            else { continue }
            quitLegacyProcess(at: url)
            try? FileManager.default.trashItem(at: url, resultingItemURL: nil)
        }
    }

    private static func shouldRetire(_ url: URL) -> Bool {
        guard let bundle = Bundle(url: url),
              let id = bundle.bundleIdentifier
        else { return false }
        if id == AppInfo.developerBundleID { return true }
        if id == "com.vorssaint.utils.dev" { return true }
        // Older personal builds that already stamped the fork marker.
        if bundle.object(forInfoDictionaryKey: "BetterVorssaintFork") as? Bool == true {
            return true
        }
        return false
    }

    private static func quitLegacyProcess(at appURL: URL) {
        let name = appURL.deletingPathExtension().lastPathComponent
        let script = """
        tell application "\(name)" to quit
        """
        if let appleScript = NSAppleScript(source: script) {
            var error: NSDictionary?
            appleScript.executeAndReturnError(&error)
        }
        let executableDir = appURL.appendingPathComponent("Contents/MacOS", isDirectory: true)
        if let items = try? FileManager.default.contentsOfDirectory(atPath: executableDir.path) {
            for item in items {
                let task = Process()
                task.executableURL = URL(fileURLWithPath: "/usr/bin/killall")
                task.arguments = [item]
                try? task.run()
                task.waitUntilExit()
            }
        }
        Thread.sleep(forTimeInterval: 0.35)
    }
}
