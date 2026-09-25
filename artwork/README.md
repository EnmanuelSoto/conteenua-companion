# Conteenua Companion icon artwork

`app-icon-source.png` is the existing Conteenua production mark, reused so the companion and browser extension are visibly first-party Conteenua software rather than a separate product brand.

Run:

```bash
npm run icon
```

The deterministic generator writes the Windows multi-resolution ICO, macOS/Linux PNGs, runtime icon and Chrome extension 16/32/48/128 px assets from that single RGBA source while preserving the Conteenua blue gradient.
