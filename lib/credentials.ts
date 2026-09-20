interface SessionStore {
  get(key: string): Promise<{ key?: unknown }>;
  remove(key: string): Promise<void>;
}

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('jevx-credentials');
    request.onupgradeneeded = () => { request.result.createObjectStore('secrets'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open credential storage'));
  });
}

async function storedKey(operation: 'read' | 'write' | 'delete', key?: string): Promise<string | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('secrets', operation === 'read' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('secrets');
      const request = operation === 'read' ? store.get('typesafe')
        : operation === 'write' ? store.put(key, 'typesafe') : store.delete('typesafe');
      transaction.oncomplete = () => resolve(operation === 'read' && typeof request.result === 'string' ? request.result : null);
      transaction.onabort = () => reject(new Error('Could not update credential storage'));
    });
  } finally {
    database.close();
  }
}

export function createCredentials(session: SessionStore) {
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }

  return {
    get: () => serialize(async () => {
      let key = await storedKey('read');
      const previous = (await session.get('key')).key;
      if (!key && typeof previous === 'string' && previous.trim()) {
        key = previous.trim();
        await storedKey('write', key);
      }
      if (previous !== undefined) await session.remove('key');
      return key;
    }),
    save: (key: string) => serialize(async () => {
      await storedKey('write', key);
      await session.remove('key');
    }),
    remove: () => serialize(async () => {
      await session.remove('key');
      await storedKey('delete');
    }),
  };
}
