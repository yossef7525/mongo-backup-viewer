// Generates public/demo.gz with deterministic, entirely fictional data. Run: npm run demo
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Decimal128, ObjectId } from 'bson';
import { encodeArchive } from '../src/archive/testing/encodeArchive.ts';

let seed = 20261011;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const oidAt = (ms: number) =>
  new ObjectId(Math.floor(ms / 1000).toString(16).padStart(8, '0') + Array.from({ length: 16 }, () => Math.floor(rnd() * 16).toString(16)).join(''));
const DAY = 86_400_000;

const names = ['Noa Levi', 'Ana García', 'Lukas Müller', 'Chloé Martin', 'João Silva', 'Иван Петров', '王伟', '佐藤 花子', 'Omar Haddad', 'Maya Cohen', 'Liam Smith', 'Sofia Rossi'];
const cities = ['Jerusalem', 'Madrid', 'Berlin', 'Paris', 'Lisbon', 'Moscow', 'Shanghai', 'Tokyo', 'Amman', 'Tel Aviv', 'London', 'Rome'];
const t0 = Date.UTC(2025, 0, 1);

const customers = Array.from({ length: 240 }, (_, i) => {
  const created = t0 + Math.floor(rnd() * 600) * DAY;
  return {
    _id: oidAt(created),
    name: `${pick(names)} ${i + 1}`,
    email: `customer${i + 1}@example.com`,
    city: pick(cities),
    vip: rnd() < 0.15,
    tags: rnd() < 0.3 ? ['newsletter'] : [],
    createdAt: new Date(created),
  };
});

const products = ['Notebook', 'Pen', 'Backpack', 'Mug', 'Lamp', 'Headphones', 'Chair', 'Desk'].map((name, i) => ({
  _id: i + 1,
  sku: `SKU-${1000 + i}`,
  name,
  price: Decimal128.fromString((5 + rnd() * 200).toFixed(2)),
  stock: Math.floor(rnd() * 500),
}));

const orders = Array.from({ length: 1200 }, () => {
  const c = pick(customers);
  const at = c.createdAt.getTime() + Math.floor(rnd() * 120) * DAY;
  const items = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
    const p = pick(products);
    return { productId: p._id, qty: 1 + Math.floor(rnd() * 4), price: p.price };
  });
  const total = items.reduce((s, it) => s + it.qty * Number(it.price.toString()), 0);
  return {
    _id: oidAt(at),
    customerId: c._id,
    status: pick(['paid', 'paid', 'paid', 'shipped', 'refunded', 'pending']),
    items,
    total: Decimal128.fromString(total.toFixed(2)),
    createdAt: new Date(at),
    shipping: { city: c.city, express: rnd() < 0.2 },
  };
});

const bytes = encodeArchive(
  [
    { db: 'demo-shop', collection: 'customers', docs: customers, indexes: [{ v: 2, key: { _id: 1 }, name: '_id_' }, { v: 2, key: { email: 1 }, name: 'email_1', unique: true }] },
    { db: 'demo-shop', collection: 'orders', docs: orders, indexes: [{ v: 2, key: { _id: 1 }, name: '_id_' }, { v: 2, key: { customerId: 1, createdAt: -1 }, name: 'customerId_1_createdAt_-1' }] },
    { db: 'demo-shop', collection: 'products', docs: products },
  ],
  { segmentSize: 200, interleave: true },
);
mkdirSync('public', { recursive: true });
writeFileSync('public/demo.gz', gzipSync(bytes, { level: 9 }));
console.log(`public/demo.gz: ${customers.length} customers, ${orders.length} orders, ${products.length} products`);
