# HSE FieldLog

HSE FieldLog is a Persian, mobile-first field safety log for construction sites. It runs as a local-first Progressive Web App and keeps operational records on the current device unless the user explicitly exports them.

## Features

- Record safety findings with contractor, location, owner, deadline, and status
- Calculate FMEA Risk Priority Number (`Severity × Occurrence × Detection`)
- Run built-in PPE, temporary electrical, mobile scaffold, and hose-reel checklists
- Track inspection nonconformities
- Export findings to UTF-8 CSV for Excel
- Print a management report or save it as PDF
- Export and restore a versioned JSON backup
- Install as a PWA and use previously visited screens offline
- Responsive Persian RTL interface

## Privacy model

Records are stored in browser `localStorage`. No real worker names, photos, contractor data, or project information are included in this public repository. Users should export a backup before clearing browser data or moving to another device.

## Development

```bash
npm ci
npm test
npm run lint
```

The test suite runs a production build, verifies the deployable worker response, and tests FMEA, deadline, summary, and CSV logic.

## Risk scoring

- Low: RPN below 25
- Medium: RPN from 25 through 74
- High: RPN 75 or above

These thresholds are application defaults and should be reviewed against the organization's approved HSE risk procedure before operational adoption.

## License

MIT
