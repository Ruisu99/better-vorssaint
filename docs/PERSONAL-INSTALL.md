# Install Better Vorssaint on a Mac

This is the **better-vorssaint** personal fork of [Vorssaint](https://github.com/vorssaintapp/vorssaint-utils). Same GPL codebase, own name (`Better Vorssaint`) and bundle id (`com.ruisu99.bettervorssaint`), so it never fights the official app for the menu bar.

You do not need Xcode.

1. Wait until **Personal build** is green on the latest commit:
   [Actions](https://github.com/Ruisu99/better-vorssaint/actions)
2. On the Mac, in Terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/Ruisu99/better-vorssaint/cursor/quick-ai-features-b4fa/Tools/install-latest.sh | zsh
```

The same command is the update: when new work is pushed, wait for the Action, run it again.

The installer:

- Puts **Better Vorssaint.app** in `/Applications`
- Quits and removes older fork copies (`Vorssaint.app`, Developer builds) so only one menu-bar icon remains
- Turns off automatic official updates

If macOS blocks the first launch, right-click `Better Vorssaint` in Applications and choose Open.

The first launch after this rename may ask again for Accessibility / Screen Recording (new bundle id). Preferences and the OpenAI key are migrated from the older `com.vorssaint.utils` install when possible.

The zip also lives at [personal-latest](https://github.com/Ruisu99/better-vorssaint/releases/tag/personal-latest).

Apple Silicon and macOS 14 or newer.
