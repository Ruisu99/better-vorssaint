# Install this fork on a Mac

This fork is built on GitHub. You do not need Xcode.

1. Wait until **Personal build** is green on the latest commit:
   [Actions](https://github.com/Ruisu99/better-vorssaint/actions)
2. On the Mac, in Terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/Ruisu99/better-vorssaint/cursor/quick-ai-features-b4fa/Tools/install-latest.sh | zsh
```

The same command is the update: when new work is pushed, wait for the Action, run it again.

If macOS blocks the first launch, right-click `Vorssaint` in Applications and choose Open.

The zip also lives at [personal-latest](https://github.com/Ruisu99/better-vorssaint/releases/tag/personal-latest).

Apple Silicon and macOS 14 or newer. Automatic checks for official Vorssaint releases are switched off by the installer, so an upstream download cannot overwrite Quick AI and the rest.
