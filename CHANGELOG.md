# Changelog

## 0.2.0

- Persistent desktop presence: the enabled state and window position are saved and restored;
  an enabled pet auto-starts with the next DSH Host.
- Alerts stay visible until dismissed, with one chime per alert and a guarded window raise.
  Completion, permission, error, max-tokens, and low-balance alerts share the same path.
- DeepSeek account balance warning below a configurable CNY threshold (¥5 default), read
  locally through DSH's account service.
- **Desktop Pet / 桌面宠物** settings tab: live balance, threshold, sound toggle, and a test
  notification, styled with native DSH settings tokens.
- `desktop_pet` agent tool gains `balance`, `set-threshold`, `set-sound`, and
  `test-notification`.
- Plugin renamed to `dsh-desktop-pet`, with the white whale-tail icon from the supplied sheet.
- Mid-turn starts reconstruct the running root turn as thinking.
- Documentation reorganized: behavior contract, test-freeze baselines, changelog, and a
  refreshed README.

## 0.1.0

- Initial desktop companion: sleeping, thinking, reply-ready, permission, hungry, and error
  moods; bilingual settings; local-bundle installation.
