# Open Issues Ledger

- Physical Android and iOS device touch momentum scrolling and hardware GPU memory constraints with 2,800+ high-resolution covers. (raised by Implementer R1, Reviewer R2)
- Extremely slow or degraded network connections where PostgreSQL query latency exceeds 30 seconds. (raised by Implementer R1, Reviewer R2)
- Review and verify on a physical Android device using npm run android:run. (raised by Implementer R1)
- CSS animation smoothness and dark mode styling of the pulse skeleton cards (shallow verification only). (raised by Implementer R1)
- Minor Robustness Risk: If user rapidly toggles between Grid and Table views multiple times per second, the DOM unmounts and remounts either 48 cards or 50 rows. Progressive loading keeps node count low, but rapid toggling creates transient garbage collection churn. (raised by Reviewer R1, Reviewer R2)
- Shallow Verification: High-DPI physical mobile screen touch scrolling was verified in desktop Playwright Chromium rather than a physical USB-connected Android phone. (raised by Reviewer R1, Reviewer R2)
- Mobile bottom navigation bar touch targets on Android emulator (shallow verification only). (raised by Reviewer R1)
