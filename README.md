# Rishi

A cross-platform EPUB reader built with Tauri.

## Building from Source

This guide will help you build Rishi from source for your operating system.

### Prerequisites

#### Installing Bun

Bun is required to build this project. Follow the instructions for your operating system:

##### macOS & Linux

Open your terminal and run:

```bash
curl -fsSL https://bun.com/install | bash
```

After installation, verify it was successful:

##### Windows

Open PowerShell and run:

```powershell
powershell -c "irm bun.com/install.ps1|iex"
```

After installation, verify it was successful:

```bash
bun --version
```

**Troubleshooting:** If you see a "command not found" error after installation, you may need to manually add Bun to your PATH. See the [Bun installation documentation](https://bun.com/docs/installation) for detailed instructions.

### Building the Application

Once Bun is installed, navigate to the project directory and run:

```bash
bunx tauri build
```

This will create platform-specific installers in the `src-tauri/target/release/bundle/` directory.

---

## For Developers

If you're looking to contribute or develop this project, please see [DEVELOPERS.md](./DEVELOPERS.md) for development setup and instructions.

---

#### Build Output Locations

- **macOS**: `.dmg` and `.app` files in `src-tauri/target/release/bundle/dmg/` and `src-tauri/target/release/bundle/macos/`
- **Windows**: `.msi` and `.exe` files in `src-tauri/target/release/bundle/msi/` and `src-tauri/target/release/bundle/nsis/`
- **Linux**: `.deb`, `.AppImage`, and other formats in `src-tauri/target/release/bundle/`

### Additional Resources

- [Bun Documentation](https://bun.com/docs)
- [Tauri Documentation](https://tauri.app/)

---

## License

See LICENSE file for details.
