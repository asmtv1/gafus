/** AG4 REVIEW ONLY: NOT wired to App, no ordinary GET/POST, no storage writes
 * until a separate fresh AG4 real-browser origin review grant exists.
 * The caller must independently verify lease, owner/epoch and HMAC scope.
 */
import type { DurableCASStore, DurableMarker } from "./reminderV2DurableSourceMock";
import { reminderV2Key } from "./reminderV2SourceCandidate";
export const REMINDER_IDB_REVIEW_KIND = "AG2_REMINDER_INDEXEDDB_REVIEW_SOURCE_ONLY" as const;
export const REMINDER_IDB_REVIEW_DB = "ag2-v2-reminder-review-only";
const TABLE = "private-intent",
  SLOT = "only",
  LOCK = "ag2-v2-reminder-review-exclusive";
export type IndexedDbReviewContext = {
  permit: { kind: typeof REMINDER_IDB_REVIEW_KIND; isCurrent(): boolean };
  idb: IDBFactory;
  locks: LockManager;
  origin(): string;
};
const fields = [
  "schemaVersion",
  "ownerScope",
  "authEpoch",
  "operationKey",
  "phase",
  "createdAt",
  "lastSeenAt",
]
  .sort()
  .join(",");
const phases = [
  "PREPARED",
  "MAY_HAVE_SENT",
  "UNKNOWN",
  "COMMITTED",
  "SERVER_COMMITTED_UNVERIFIED_DRAFT",
  "REJECTED",
];
function markerOk(value: unknown): value is DurableMarker {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  if (
    Object.keys(o).sort().join(",") !== fields ||
    o.schemaVersion !== 1 ||
    typeof o.ownerScope !== "string" ||
    !/^psn_[A-Za-z0-9_-]{20,100}$/.test(o.ownerScope) ||
    typeof o.authEpoch !== "string" ||
    !/^epoch_[A-Za-z0-9_-]{8,100}$/.test(o.authEpoch) ||
    typeof o.operationKey !== "string" ||
    !phases.includes(String(o.phase)) ||
    !Number.isSafeInteger(o.createdAt) ||
    !Number.isSafeInteger(o.lastSeenAt) ||
    Number(o.createdAt) < 0 ||
    Number(o.lastSeenAt) < Number(o.createdAt)
  )
    return false;
  try {
    reminderV2Key(o.operationKey);
  } catch {
    return false;
  }
  return true;
}
export function makeReminderV2IndexedDbReview({
  permit,
  idb,
  locks,
  origin,
}: IndexedDbReviewContext): DurableCASStore {
  const allowed = () => {
    let url: URL;
    try {
      url = new URL(origin());
    } catch {
      throw Error("REVIEW_ORIGIN_DENIED");
    }
    if (
      permit?.kind !== REMINDER_IDB_REVIEW_KIND ||
      !permit.isCurrent() ||
      typeof idb?.open !== "function" ||
      typeof locks?.request !== "function" ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !["http:", "https:"].includes(url.protocol) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw Error("REVIEW_NOT_GRANTED");
  };
  const withinLock = async <T>(op: () => Promise<T>): Promise<T> => {
    allowed();
    return locks.request(LOCK, { mode: "exclusive", ifAvailable: true }, async (lock) => {
      if (!lock) throw Error("REVIEW_LOCK_UNAVAILABLE");
      allowed();
      return op();
    });
  };
  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      allowed();
      let req: IDBOpenDBRequest;
      try {
        req = idb.open(REMINDER_IDB_REVIEW_DB, 1);
      } catch {
        reject(Error("REVIEW_OPEN_FAILED"));
        return;
      }
      req.onblocked = () => reject(Error("REVIEW_OPEN_BLOCKED"));
      req.onerror = () => reject(Error("REVIEW_OPEN_FAILED"));
      req.onupgradeneeded = (e) => {
        try {
          if (e.oldVersion !== 0 || req.result.objectStoreNames.contains(TABLE)) {
            req.transaction?.abort();
            return;
          }
          req.result.createObjectStore(TABLE);
        } catch {
          req.transaction?.abort();
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (
          db.version !== 1 ||
          db.objectStoreNames.length !== 1 ||
          !db.objectStoreNames.contains(TABLE)
        ) {
          db.close();
          reject(Error("REVIEW_SCHEMA_MISMATCH"));
          return;
        }
        resolve(db);
      };
    });
  const transaction = async <T>(
    mode: IDBTransactionMode,
    perform: (store: IDBObjectStore, done: (value: T) => void, abort: () => void) => void,
  ): Promise<T> => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          // A fail-closed strict commit is required before a possible POST.
          tx =
            mode === "readwrite"
              ? db.transaction(TABLE, mode, { durability: "strict" })
              : db.transaction(TABLE, mode);
          if (mode === "readwrite" && tx.durability !== "strict") {
            tx.abort();
            reject(Error("REVIEW_STRICT_DURABILITY_UNAVAILABLE"));
            return;
          }
        } catch {
          reject(Error("REVIEW_TX_DENIED"));
          return;
        }
        let result: T,
          hasResult = false,
          settled = false;
        const fail = () => {
          if (!settled) {
            settled = true;
            reject(Error("REVIEW_TX_UNCERTAIN"));
          }
        };
        tx.onerror = fail;
        tx.onabort = fail;
        tx.oncomplete = () => {
          if (!settled) {
            if (!hasResult) fail();
            else {
              settled = true;
              resolve(result);
            }
          }
        };
        const done = (v: T) => {
          result = v;
          hasResult = true;
        };
        const abort = () => {
          try {
            tx.abort();
          } catch {
            fail();
          }
        };
        try {
          perform(tx.objectStore(TABLE), done, abort);
        } catch {
          abort();
        }
      });
    } finally {
      db.close();
    }
  };
  return {
    read: () =>
      withinLock(() =>
        transaction<unknown>("readonly", (store, done, abort) => {
          const req = store.get(SLOT);
          req.onsuccess = () => {
            const value: unknown = req.result ?? null;
            if (value !== null && !markerOk(value)) {
              abort();
              return;
            }
            done(value);
          };
          req.onerror = abort;
        }),
      ),
    compareAndSwap: (expected, next) =>
      withinLock(async () => {
        if (!markerOk(next) || (expected !== null && !markerOk(expected)))
          throw Error("REVIEW_INVALID_MARKER");
        return transaction<boolean>("readwrite", (store, done, abort) => {
          const req = store.get(SLOT);
          req.onsuccess = () => {
            const current: unknown = req.result ?? null;
            if (current !== null && !markerOk(current)) {
              abort();
              return;
            }
            if (JSON.stringify(current) !== JSON.stringify(expected)) {
              done(false);
              return;
            }
            try {
              store.put(next, SLOT);
              done(true);
            } catch {
              abort();
            }
          };
          req.onerror = abort;
        });
      }),
  };
}
