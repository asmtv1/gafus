# Проверка исторических SHA-256

Дата: 29.10.2026. Содержимое перенесённых файлов и связанных исторических JSON-контрактов не изменялось.

- 40 перенесённых файлов: исходный SHA-256 равен SHA-256 архивной копии.
- Of 10 checksum-pinned JSON files referenced by test/audit code, 8 still reside in their original workdirs and 2 G05 receipts have been relocated byte-identically to `docs/archive/agents/receipts/mobile-g05/`. Archive verification resolves historical paths and checks saved original SHA-256.
- Из 43 проверенных записей SHA-256 в сохранённых JSON-контрактах **42 соответствуют** архивным файлам.
- **Одна историческая запись относится к прежней редакции**: контракт
  apps/api/g1-off021-v2-journal-local-v1/G1_OFF021_V2_TRAINING_JOURNAL_LOCAL.contract.v1.json
  записывает для apps/api/G1_AG1_OFF021_V2_JOURNAL_SOURCE_SCOPE_AG4_AG3_HANDOFF_20261017.md
  SHA-256 cc7745a30ea7e92129a3096d6209098b01cdeebad82066dec6ad9ddfea10b397
  и размер 8771 байт.
  Более поздний контракт .contract.v1_1.json указывает на текущую редакцию SHA-256
  fa63e44117b0d45a05dc613e24bdf2d7d649afb0a7ecb26f6d009319f5f7cd35
  и размер 11133 байт — точное совпадение с перенесённым файлом.

Историческая запись v1 не переписывалась: замена её SHA-256 исказила бы исходные доказательства.
Проверка python3 scripts/docs/archive_agent_handoffs.py --verify допускает только эту конкретную
старую запись, а при любых новых несовпадениях завершится ошибкой.
