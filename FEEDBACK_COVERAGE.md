# COMFORTage T3.3 Feedback Coverage

This file maps the received system feedback to the current implementation and follow-up items.

## Covered Now

| Feedback point | Coverage |
| --- | --- |
| IPFS works | Implemented through `POST /api/v1/hash/upload`; files are uploaded to IPFS and returned with `fileCid` and gateway URL. |
| Trial and synthetic datasets can be uploaded | Supported through GUI upload and CLI upload. Batch upload examples are now documented in `public/CLI_GUIDE.md`. |
| Access to files can be controlled | Supported through authenticated roles and upload permissions. Dataset retrieval requires a valid token. |
| History can be viewed | Supported through `GET /api/v1/hash/history/:datasetId` and the GUI history modal. |
| Records can be updated and managed | Supported through `PUT /api/v1/hash/:datasetId` and GUI update controls for upload-capable roles. |
| Non-technical users need a GUI | Covered by `/app`; the UI has been refreshed to be cleaner, more modern, and easier to use. |
| Access control should work inside a single file | Implemented for CSV files through `columnPolicy`; individual columns can be restricted to roles such as doctor, pharmacist, consent officer, or admin. |
| Healthcare potential: decentralized storage, access control, version tracking | Covered by IPFS storage, on-chain hash anchoring, version history, role access, audit summary, and integrity checks. |
| GDPR/privacy implications should be explained carefully | Covered in `public/CLI_GUIDE.md` with a note that the system supports privacy/auditability but does not remove data-controller obligations. |
| Agentic AI workflows should be future-proofed | Covered in `public/CLI_GUIDE.md` with recommended future `agent` roles, scoped tokens, data retrieval audit logs, and rate limits. |
| Integration with other technical components should happen earlier | The API is ready for integration with PDT, TET, TEM, ICML, and similar systems through documented endpoints. |
| Provide command-line instructions | Covered in `public/CLI_GUIDE.md` for WSL Bash and PowerShell. |
| Provide safer batch upload instructions | Covered in `public/CLI_GUIDE.md` with separate Bash and PowerShell batch upload examples. |
| Send a screenshot once data is uploaded | Operational follow-up: once the target datasets are uploaded, capture `/app` showing dashboard/dataset state. |
| Collaboration notes: Polar API and explainable analysis tools | Logged as collaboration/future integration opportunities. No product change required yet. |

## Important Clarifications

The system improves the data handling model by combining IPFS, hash anchoring, role-based access, version history, and auditability. However, it should not be described as eliminating GDPR obligations. A safer phrasing is:

> The system can simplify parts of the storage and auditability burden by decentralizing file storage, anchoring integrity proofs on-chain, and enforcing role-based access. The data controller still remains responsible for lawful access, consent, retention, minimization, and governance.

## Recommended Next Steps

1. Upload a small representative CSV with `columnPolicy`.
2. Test retrieval as nurse, doctor, pharmacist, consent officer, auditor, and admin.
3. Confirm column visibility matches the intended policy.
4. Batch upload remaining partner datasets through WSL Bash or PowerShell.
5. Capture screenshots from `/app`.
6. Define integration requirements for PDT, TET, TEM, ICML, and future agent access.
7. If AI-agent access becomes part of scope, add explicit agent roles and retrieval audit logs before enabling automated scraping/parsing.
