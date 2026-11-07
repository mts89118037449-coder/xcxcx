// Простое хранилище в JSON-файле. Для старта хватает с запасом (тысячи пользователей).

import fs from 'node:fs';
import path from 'node:path';
import type { Brief } from './generator.ts';

export interface User {
  id: number;
  name: string;
  credits: number; // оплаченные генерации
  freeUsed: boolean; // бесплатная пробная генерация потрачена
  referrer?: number; // кто пригласил
  referralRewarded: boolean; // пригласивший уже получил бонус
  step?: number; // текущий шаг анкеты (undefined — анкета не идёт)
  answers: Partial<Brief>;
  generated: number;
  paidStars: number;
  createdAt: string;
}

export interface Payment {
  userId: number;
  packageId: string;
  stars: number;
  chargeId: string;
  at: string;
}

interface Db {
  users: Record<string, User>;
  payments: Payment[];
}

export class Store {
  private db: Db;

  constructor(private file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { users: {}, payments: [] };
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }

  get(id: number): User | undefined {
    return this.db.users[id];
  }

  getOrCreate(id: number, name: string): { user: User; isNew: boolean } {
    const existing = this.db.users[id];
    if (existing) return { user: existing, isNew: false };
    const user: User = {
      id,
      name,
      credits: 0,
      freeUsed: false,
      referralRewarded: false,
      answers: {},
      generated: 0,
      paidStars: 0,
      createdAt: new Date().toISOString(),
    };
    this.db.users[id] = user;
    this.save();
    return { user, isNew: true };
  }

  hasPayment(chargeId: string) {
    return this.db.payments.some((p) => p.chargeId === chargeId);
  }

  addPayment(p: Payment) {
    this.db.payments.push(p);
    this.save();
  }

  stats() {
    const users = Object.values(this.db.users);
    const since = Date.now() - 24 * 3600 * 1000;
    return {
      users: users.length,
      newToday: users.filter((u) => Date.parse(u.createdAt) > since).length,
      generated: users.reduce((s, u) => s + u.generated, 0),
      payments: this.db.payments.length,
      stars: this.db.payments.reduce((s, p) => s + p.stars, 0),
      starsToday: this.db.payments.filter((p) => Date.parse(p.at) > since).reduce((s, p) => s + p.stars, 0),
    };
  }
}
