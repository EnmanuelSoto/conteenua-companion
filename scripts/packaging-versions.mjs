import { SUPPORTED_ARCHES, SUPPORTED_PLATFORMS } from './packaging-targets.mjs';

export { SUPPORTED_ARCHES, SUPPORTED_PLATFORMS };

export const TUNNEL_CLIENT = Object.freeze({
  version: 'v0.0.14',
  targets: Object.freeze({
    win32: Object.freeze({
      x64: Object.freeze({ upstreamArch: 'amd64', sha256: '784ab8da7b5a88f0109f1fd8aaf0a1c86067430b896dddf307ef7e3cc49fa1a5' }),
      arm64: Object.freeze({ upstreamArch: 'arm64', sha256: 'fa775db8897df543dd4ba66404f69492a2acfbc6a291f10df27aced064a16568' })
    }),
    darwin: Object.freeze({
      x64: Object.freeze({ upstreamArch: 'amd64', sha256: '75e10be774184fb42189e347b16eb6bc9fb0780135d8af714d34e30ce068dc53' }),
      arm64: Object.freeze({ upstreamArch: 'arm64', sha256: 'b540493c5bdbcdbb755700c8e2e16597e28b1569e425007e0f73111047bd6a64' })
    }),
    linux: Object.freeze({
      x64: Object.freeze({ upstreamArch: 'amd64', sha256: '15bd17e805cad39d412199115bb9e10a978dd35258a114cdf25dd2ae6681c7d3' }),
      arm64: Object.freeze({ upstreamArch: 'arm64', sha256: '2de3fb879a18edb847e0313592c912f1983685488290a7fdba7ac403e6a4fb0a' })
    })
  })
});

export const CLOUDFLARED = Object.freeze({
  version: '2026.9.1',
  targets: Object.freeze({
    win32: Object.freeze({
      // Cloudflare does not publish a native Windows arm64 binary. Windows 11 on Arm
      // supports x64 emulation, so both installers intentionally stage the same official
      // amd64 executable instead of falling back to tunnel-client's older embedded copy.
      x64: Object.freeze({ asset: 'cloudflared-windows-amd64.exe', sha256: '2837888cc0f5d58f15b6dc478376de90b4d3ba5241c7947455d1e0a0df429712' }),
      arm64: Object.freeze({ asset: 'cloudflared-windows-amd64.exe', sha256: '2837888cc0f5d58f15b6dc478376de90b4d3ba5241c7947455d1e0a0df429712' })
    }),
    darwin: Object.freeze({
      x64: Object.freeze({ asset: 'cloudflared-darwin-amd64.tgz', sha256: 'ff0d3b51d5ff70eceef89d6b32145fee985018a2174596a5dbe405e2766e2ac4' }),
      arm64: Object.freeze({ asset: 'cloudflared-darwin-arm64.tgz', sha256: 'c27ab8fd0aa489449e3d201eb02f957ef460a13b613662928b1b23394bf1bcfe' })
    }),
    linux: Object.freeze({
      x64: Object.freeze({ asset: 'cloudflared-linux-amd64', sha256: '03f1f25d1cc93b9ad6c60569d44060bc4f17ed97075760ed8cfca4b12dcd68cc' }),
      arm64: Object.freeze({ asset: 'cloudflared-linux-arm64', sha256: '3d97437c71848bd8df68041e12436b484a661d95073ea1937f01a845ce88faa3' })
    })
  })
});

export const RIPGREP = Object.freeze({
  version: '15.2.0',
  targets: Object.freeze({
    win32: Object.freeze({
      x64: Object.freeze({ upstreamArch: 'x86_64', triple: 'pc-windows-msvc', extension: 'zip', sha256: '71b2fef860abe467217a538ff31de02f5258807c0129f771846f87bd029aafc5' }),
      arm64: Object.freeze({ upstreamArch: 'aarch64', triple: 'pc-windows-msvc', extension: 'zip', sha256: 'e4abca10c3a64ebea742667dd7009449d49403db5460dd6873e389fa2945360f' })
    }),
    darwin: Object.freeze({
      x64: Object.freeze({ upstreamArch: 'x86_64', triple: 'apple-darwin', extension: 'tar.gz', sha256: 'af7825fcc69a2afc7a7aea55fc9af90e26421d8f20fe59df32e233c0b8a231c1' }),
      arm64: Object.freeze({ upstreamArch: 'aarch64', triple: 'apple-darwin', extension: 'tar.gz', sha256: '3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4' })
    }),
    linux: Object.freeze({
      x64: Object.freeze({ upstreamArch: 'x86_64', triple: 'unknown-linux-musl', extension: 'tar.gz', sha256: '33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c' }),
      arm64: Object.freeze({ upstreamArch: 'aarch64', triple: 'unknown-linux-musl', extension: 'tar.gz', sha256: '800b1e7206afe799dfb5a6901f23147cfaabe0e52210538100f61e86e1740915' })
    })
  })
});
