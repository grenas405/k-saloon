# Changelog

All notable changes to K Saloon POS are documented here.

## [0.5.0] - 2026-06-01

### Added
- Sales History tab with dated ticket lookup, line-item inspection, receipt reprint, and CSV exports for sales and line items.
- Void sale workflow that keeps the original ticket for audit while excluding voided sales from revenue, dashboard, closeout, and payment mix totals.
- End-of-day closeout summary with paid ticket count, cash/card totals, tax, void totals, top items, and printable/PDF report preview.
- Manual backup controls in Settings with backup folder visibility, Backup Now, recent snapshot list, and desktop folder opening.

### Changed
- Dashboard and daily totals now count only paid sales while History still displays voided tickets.
- Receipts for voided sales now print with a visible VOID banner and reason.

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
