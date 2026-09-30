/**
 * Firestore em memória suficiente para testar o backend sem credenciais.
 * Implementa apenas o que o Quiz Arena usa: coleções, documentos, queries
 * simples, batches, FieldValue (serverTimestamp/increment) e transações.
 *
 * Não é um substituto do Firestore real: serve para validar a lógica de
 * orquestração (sorteio, transação de resposta, fechamento do dia).
 */
const clone = (value) => (value === undefined ? undefined : structuredClone(value))

function applyDottedPath(target, dottedPath, value) {
  const parts = dottedPath.split('.')
  let cursor = target

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]
    if (typeof cursor[key] !== 'object' || cursor[key] === null) {
      cursor[key] = {}
    }
    cursor = cursor[key]
  }

  cursor[parts.at(-1)] = value
}

function getDottedPath(source, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => value?.[key], source)
}

function setDottedPath(target, dottedPath, value) {
  const parts = dottedPath.split('.')
  let cursor = target

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]
    if (typeof cursor[key] !== 'object' || cursor[key] === null) {
      cursor[key] = {}
    }
    cursor = cursor[key]
  }

  const last = parts.at(-1)
  if (value === DELETE_FIELD) {
    delete cursor[last]
  } else {
    cursor[last] = value
  }
}

const DELETE_FIELD = Symbol('delete')

class Snapshot {
  constructor(id, data, ref) {
    this.id = id
    this._data = data
    this.exists = data !== undefined
    this.ref = ref
  }

  data() {
    return clone(this._data)
  }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs
    this.empty = docs.length === 0
  }

  get data() {
    return this.docs
  }
}

class DocumentReference {
  constructor(store, path) {
    this.store = store
    this.path = path
    this.id = path.split('/').at(-1)
  }

  async get() {
    return new Snapshot(this.id, clone(this.store.docs.get(this.path)), this)
  }

  async set(data) {
    this.store.docs.set(this.path, clone(data))
  }

  async update(data) {
    const current = this.store.docs.get(this.path)

    if (current === undefined) {
      throw new Error(`Documento não encontrado: ${this.path}`)
    }

    this.store.docs.set(this.path, applyIncrements(current, clone(data)))
  }

  async create(data) {
    if (this.store.docs.has(this.path)) {
      throw new Error(`Documento já existe: ${this.path}`)
    }
    this.store.docs.set(this.path, clone(data))
  }

  async delete() {
    this.store.docs.delete(this.path)
  }
}

class CollectionReference {
  constructor(store, path) {
    this.store = store
    this.path = path
  }

  get id() {
    return this.path.split('/').at(-1)
  }

  doc(id) {
    return new DocumentReference(this.store, `${this.path}/${id}`)
  }

  collection(id) {
    return new CollectionReference(this.store, `${this.path}/${id}`)
  }

  async get() {
    const prefix = `${this.path}/`
    const docs = [...this.store.docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, data]) => new Snapshot(path.slice(prefix.length), clone(data), this.doc(path.slice(prefix.length))))
      .filter((snapshot) => snapshot.exists)

    return new QuerySnapshot(docs)
  }

  where(field, _op, value) {
    return new Query(this, [['where', field, value, _op]])
  }

  orderBy(field, direction = 'asc') {
    return new Query(this, [['orderBy', field, direction]])
  }

  limit(count) {
    return new Query(this, [['limit', count]])
  }

  // Firestore: `collection.count()` devolve um AggregateQuery resolvido por
  // `.get()`, diferente de `collection.get().size`.
  count() {
    return new AggregateQuery(this)
  }
}

class Query {
  constructor(collection, operations = []) {
    this.collection = collection
    this.operations = operations
  }

  where(field, _op, value) {
    return new Query(this.collection, [...this.operations, ['where', field, value, _op]])
  }

  orderBy(field, direction = 'asc') {
    return new Query(this.collection, [...this.operations, ['orderBy', field, direction]])
  }

  limit(count) {
    return new Query(this.collection, [...this.operations, ['limit', count]])
  }

  // Firestore: `collection.count()` devolve um AggregateQuery resolvido por
  // `.get()`, diferente de `collection.get().size`.
  count() {
    return new AggregateQuery(this)
  }

  async get() {
    let snapshot = await this.collection.get()
    let docs = snapshot.docs

    for (const [type, a, b, _op] of this.operations) {
      if (type === 'where') {
        if (_op === '==') {
          docs = docs.filter((doc) => getDottedPath(doc._data, a) === b)
        } else if (_op === '>=') {
          docs = docs.filter((doc) => (getDottedPath(doc._data, a) ?? '') >= b)
        } else if (_op === '<=') {
          docs = docs.filter((doc) => (getDottedPath(doc._data, a) ?? '') <= b)
        } else if (_op === '>') {
          docs = docs.filter((doc) => (getDottedPath(doc._data, a) ?? '') > b)
        } else if (_op === '<') {
          docs = docs.filter((doc) => (getDottedPath(doc._data, a) ?? '') < b)
        } else {
          throw new Error(`Operador where não suportado no stub: ${_op}`)
        }
      } else if (type === 'orderBy') {
        const sign = b === 'desc' ? -1 : 1
        docs = [...docs].sort((left, right) => {
          const leftValue = getDottedPath(left._data, a) ?? 0
          const rightValue = getDottedPath(right._data, a) ?? 0
          return (leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0) * sign
        })
      } else if (type === 'limit') {
        docs = docs.slice(0, a)
      }
    }

    return new QuerySnapshot(docs)
  }

  async count() {
    const snapshot = await this.get()
    return { data: () => ({ count: snapshot.docs.length }) }
  }
}

/** Equivalente ao AggregateQuery do SDK Admin (`collection.count().get()`). */
class AggregateQuery {
  constructor(query) {
    this.query = query
  }

  async get() {
    const snapshot = await this.query.get()
    return { data: () => ({ count: snapshot.docs.length }) }
  }
}

class WriteBatch {
  constructor(store) {
    this.store = store
    this.operations = []
  }

  set(ref, data) {
    this.operations.push(() => ref.set(data))
  }

  update(ref, data) {
    this.operations.push(() => ref.update(data))
  }

  delete(ref) {
    this.operations.push(() => ref.delete())
  }

  async commit() {
    for (const operation of this.operations) {
      await operation()
    }
  }
}

function resolveSentinels(data) {
  const now = { __type: 'timestamp' }

  const walk = (value) => {
    if (!value || typeof value !== 'object') return value

    if (value.__type === 'serverTimestamp') return new Date().toISOString()

    if (value.__type === 'increment') {
      return { __increment: value.value }
    }

    const out = Array.isArray(value) ? [] : {}
    for (const [key, entry] of Object.entries(value)) {
      out[key] = walk(entry)
    }
    return out
  }

  return walk(data)
}

function applyIncrements(current, incoming) {
  if (incoming && typeof incoming === 'object' && incoming.__increment !== undefined) {
    return Number(current ?? 0) + incoming.__increment
  }

  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return incoming
  }

  const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {}
  const out = structuredClone(base)

  for (const [key, value] of Object.entries(incoming)) {
    if (key.includes('.')) {
      // Chave com ponto = field path do Firestore: `respostas.<dia>.<player>`.
      const currentValue = getDottedPath(out, key)
      setDottedPath(out, key, applyIncrements(currentValue, value))
      continue
    }

    if (value && typeof value === 'object' && value.__increment !== undefined) {
      out[key] = Number(out[key] ?? 0) + value.__increment
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = applyIncrements(out[key], value)
    } else {
      out[key] = value
    }
  }

  return out
}

class FirestoreStub {
  constructor() {
    this.docs = new Map()
  }

  collection(path) {
    return new CollectionReference(this, path)
  }

  doc(path) {
    return new DocumentReference(this, path)
  }

  getAll(...refs) {
    return Promise.all(refs.map((ref) => ref.get()))
  }

  batch() {
    return new WriteBatch(this)
  }

  /**
   * Transação simplificada: reexecuta o callback uma vez para simular retry e
   * aplica as escritas ao final. Detecta conflito de versão como o Firestore.
   */
  async runTransaction(callback) {
    const writes = []
    const seen = new Set()

    const transaction = {
      get: (ref) => {
        if (seen.has(ref.path)) {
          throw new Error(`Conflito de transação em ${ref.path}`)
        }
        seen.add(ref.path)
        return ref.get()
      },
      getAll: (...refs) => {
        for (const ref of refs) {
          if (seen.has(ref.path)) {
            throw new Error(`Conflito de transação em ${ref.path}`)
          }
          seen.add(ref.path)
        }
        return Promise.all(refs.map((ref) => ref.get()))
      },
      set: (ref, data) => {
        writes.push(() => ref.set(resolveSentinels(data)))
      },
      update: (ref, data) => {
        writes.push(async () => {
          const current = this.docs.get(ref.path)
          if (current === undefined) {
            throw new Error(`Documento não encontrado: ${ref.path}`)
          }
          this.docs.set(ref.path, applyIncrements(current, resolveSentinels(data)))
        })
      },
      create: (ref, data) => {
        writes.push(() => ref.create(resolveSentinels(data)))
      },
      delete: (ref) => {
        writes.push(() => ref.delete())
      },
    }

    const result = await callback(transaction)

    for (const write of writes) {
      await write()
    }

    return result
  }

  seed(collection, docs) {
    for (const [id, data] of Object.entries(docs)) {
      this.docs.set(`${collection}/${id}`, clone(data))
    }
  }

  read(collection, id) {
    return clone(this.docs.get(`${collection}/${id}`))
  }
}

export const DELETE_FIELD_MARKER = DELETE_FIELD
export { applyDottedPath, FirestoreStub }
