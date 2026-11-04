# Database

Fluxora uses SQLite via the `sqlite3` package with WAL journaling. The database lives at `<userData>/aiworkspace.db`.

## Pragmas

Applied on every open:

| Pragma | Value | Reason |
|---|---|---|
| `journal_mode` | WAL | Concurrent reads during writes |
| `synchronous` | NORMAL | WAL-safe durability/speed tradeoff |
| `foreign_keys` | ON | Referential integrity |
| `auto_vacuum` | INCREMENTAL | Space reclamation without full vacuum |
| `busy_timeout` | 3000ms | Wait instead of failing on lock contention |

## Schema (v1)

### settings
| Column | Type | Notes |
|---|---|---|
| key | TEXT PK | Setting name |
| value | TEXT | JSON-encoded value |
| updated_at | TEXT | ISO timestamp |

### providers
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT | Display name |
| type | TEXT | openai / anthropic / gemini / ollama / custom |
| base_url | TEXT | API endpoint |
| api_key | TEXT | Plaintext (see SECURITY.md) |
| models | TEXT | JSON array of model IDs |
| enabled | INTEGER | 0/1 |
| is_custom | INTEGER | 0/1 — builtin vs user-added |
| color | TEXT | UI accent |
| capabilities | TEXT | JSON: apiKind, supportsStreaming, supportsVision, contextWindow |
| created_at | TEXT | |
| updated_at | TEXT | |

### workspaces
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT | Display name |
| path | TEXT | Absolute filesystem path |
| color | TEXT | UI accent |
| icon | TEXT | Emoji/icon |
| created_at | TEXT | |
| updated_at | TEXT | |
| last_opened_at | TEXT | For recency sorting |
| settings | TEXT | JSON: WorkspaceSettings |

### chats
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| workspace_id | TEXT FK → workspaces | Nullable (global chats) |
| title | TEXT | Auto-generated from first message |
| pinned | INTEGER | 0/1 |
| archived | INTEGER | 0/1 |
| favorite | INTEGER | 0/1 |
| provider_id | TEXT | Active provider |
| model_id | TEXT | Active model |
| created_at | TEXT | |
| updated_at | TEXT | Recency sort key |

### messages
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| chat_id | TEXT FK → chats | |
| role | TEXT | user / assistant / system |
| content | TEXT | Message body |
| reasoning | TEXT | Chain-of-thought (if model returns it) |
| model | TEXT | Model that generated |
| provider_id | TEXT | Provider that generated |
| files | TEXT | JSON array of AttachedFile |
| usage | TEXT | JSON TokenUsage |
| status | TEXT | pending / streaming / done / error |
| parent_id | TEXT | For branching |
| branch_id | TEXT | Branch grouping |
| token_count | INTEGER | |
| created_at | TEXT | |

### memories
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| workspace_id | TEXT FK → workspaces | Nullable for global |
| scope | TEXT | global / workspace |
| type | TEXT | user / conversation / project / custom |
| content | TEXT | Memory text |
| source | TEXT | manual / auto |
| pinned | INTEGER | 0/1 |
| tags | TEXT | JSON array |
| created_at | TEXT | |
| updated_at | TEXT | |

### project_brain
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| workspace_id | TEXT FK → workspaces | |
| title | TEXT | Entry title |
| content | TEXT | Entry body |
| kind | TEXT | note / decision / architecture / convention / todo |
| status | TEXT | open / done |
| tags | TEXT | JSON array |
| pinned | INTEGER | 0/1 |
| source | TEXT | manual / auto |
| created_at | TEXT | |
| updated_at | TEXT | |

### prompts
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| workspace_id | TEXT FK → workspaces | Nullable = global |
| name | TEXT | Display name |
| content | TEXT | Template body with {{variables}} |
| description | TEXT | |
| category | TEXT | Grouping |
| pinned | INTEGER | 0/1 |
| variables | TEXT | JSON array of PromptVariable |
| created_at | TEXT | |
| updated_at | TEXT | |

### usage
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| provider_id | TEXT | |
| model | TEXT | |
| chat_id | TEXT | |
| workspace_id | TEXT | |
| prompt_tokens | INTEGER | |
| completion_tokens | INTEGER | |
| total_tokens | INTEGER | |
| cost | REAL | USD |
| response_time_ms | INTEGER | |
| streaming | INTEGER | 0/1 |
| status | TEXT | success / error |
| created_at | TEXT | |

### notifications
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| title | TEXT | |
| message | TEXT | |
| type | TEXT | info / success / warning / error |
| timestamp | TEXT | |
| read | INTEGER | 0/1 |

### terminal_history
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK → workspaces | |
| command | TEXT | |
| output | TEXT | |
| exit_code | INTEGER | |
| cwd | TEXT | |
| approved_by | TEXT | Checkpoint approver |
| created_at | TEXT | |
| duration_ms | INTEGER | |

### workspace_index
| Column | Type | Notes |
|---|---|---|
| workspace_id | TEXT PK | FK → workspaces |
| data | TEXT | JSON WorkspaceIndex blob |

## Indexes

```
chats:     workspace_id, updated_at, pinned
providers: enabled
messages:  created_at, chat_id, parent_id
usage:     created_at, provider_id
memories:  workspace_id
prompts:   workspace_id
terminal:  workspace_id
notifications: read
brain:     workspace_id, pinned
```

## Migration Strategy

`runMigrations()` uses `CREATE TABLE IF NOT EXISTS` (idempotent) plus `ensureColumn()` for additive column migrations. `ensureColumn()` checks `PRAGMA table_info` and issues `ALTER TABLE ADD COLUMN` if missing. This pattern supports both fresh installs and upgrades from any prior schema version without version tracking.

## Backup

`startAutoBackup()` runs on an interval (configurable via `AppSettings.backupIntervalHours`). Backups use SQLite `VACUUM INTO` for a consistent snapshot, then delete `secret_records`, clear legacy `providers.api_key`, run `PRAGMA integrity_check`, and write a checksum manifest. Manual backup, export, and restore are available via the backup IPC group. Restore verifies the candidate, keeps a timestamped pre-restore copy, reopens the database, and relaunches the app. Backups intentionally exclude credentials; re-enter keys after restoring on a different machine.
