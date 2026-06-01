# Changelog

All notable changes to K Saloon POS are documented here.

## [0.4.0] - 2026-06-01

### Added
- Initial K Saloon local-first POS implementation.
- Deno + Hono backend sidecar bound to `127.0.0.1` with SQLite persistence.
- Register, Dashboard, Catalog, Settings, receipt preview, print, save-PDF, and daily backups.
- K Saloon business seed settings for 3711 S High Ave, Oklahoma City, OK 73129.
- Generic editable bar catalog seeded with beer, cocktails, shots, wine, non-alcohol, snacks, pool/games, and fees.
- Embedded K Saloon logo data URI for offline receipts and renderer logo asset.

### Changed
- Rebranded the reference salon implementation to K Saloon POS.
- Updated packaging metadata, backend binary names, receipt defaults, and amber/red brand colors.
