# CSV Cleaner

Paste or upload messy CSV data and get clean, normalized output instantly. Built for quick data fixes before loading a file into another tool.

## Features

- Paste CSV text or upload a `.csv`/`.tsv` file
- Auto-detects the delimiter (comma, semicolon, tab, pipe) or pick one manually
- Normalize line endings (CRLF/CR → LF) and trim whitespace in every cell
- Header cleanup: lowercase or snake_case naming, manual renames, automatic `name_2`-style deduplication of conflicting column names
- Remove empty rows (including whitespace-only rows)
- Remove duplicate rows — compare full rows or select key columns
- Type coercion preview: converts numbers, dates and booleans in one column and shows a before/after diff with the detected type
- Boolean rendering: `true/false`, `yes/no` or `1/0`
- Column selection to keep (and reorder) only the columns you need
- Live stats panel: rows in/out, columns, duplicates removed, empty rows removed, cells trimmed
- Quoting control: auto, minimal, quote-all or no quotes
- Download the cleaned CSV or copy it to the clipboard
- Shareable state via URL, image/PDF export, and 100% client-side processing — no data ever leaves your browser

## Keyboard shortcuts

| Key | Action           |
| --- | ---------------- |
| `C` | Copy cleaned CSV |

## Development

```bash
npm install
npm run build -w @itsjust/core   # build shared core first
npm run dev
npm test
```

## Deployment

```bash
docker build -t itsjust-csv-cleaner .
docker run -p 3000:3000 itsjust-csv-cleaner
```

## License

MIT
