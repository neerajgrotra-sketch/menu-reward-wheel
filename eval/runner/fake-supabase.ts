// Phase 2/3 — the eval framework's only piece of genuinely new test
// infrastructure. A minimal, closed-surface in-memory stand-in for
// SupabaseClient<Database>, scoped to exactly the call shapes
// buildProposal/insertProposalVersion/applyDiscountProposal/revalidateProposal
// (and, later, the revenue-intelligence analytics tools) actually use —
// enumerated below, not a general-purpose mock library. Lives entirely
// under eval/, never imported by production code.
//
// Consumers must cast this to SupabaseClient<Database> at the call site
// (`as unknown as SupabaseClient<Database>`) — it deliberately does not
// attempt to structurally satisfy postgrest-js's real, enormous generic
// query-builder type. That's a standard test-double pattern: match the
// runtime shape the code under test actually calls, not the full compile-
// time interface.

type Row = Record<string, unknown>;

type FilterFn = (row: Row) => boolean;

function isNullish(value: unknown): boolean {
  return value === null || value === undefined;
}

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: FilterFn[] = [];
  private orderBy: Array<{ column: string; ascending: boolean }> = [];
  private limitN: number | null = null;
  private singleMode = false;
  private maybeSingleMode = false;

  constructor(
    private table: Row[],
    private op: 'select' | 'insert' | 'update',
    private payload?: Row,
  ) {}

  select(_columns?: string): this {
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  is(column: string, value: null): this {
    this.filters.push((row) => (value === null ? isNullish(row[column]) : row[column] === value));
    return this;
  }
  gte(column: string, value: unknown): this {
    this.filters.push((row) => (row[column] as string | number) >= (value as string | number));
    return this;
  }
  lt(column: string, value: unknown): this {
    this.filters.push((row) => (row[column] as string | number) < (value as string | number));
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: opts?.ascending ?? true });
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  maybeSingle(): this {
    this.maybeSingleMode = true;
    return this;
  }
  single(): this {
    this.singleMode = true;
    return this;
  }

  // Makes the builder awaitable directly (`await client.from(...).update(...).eq(...)`),
  // matching every real call site in the pipeline — none of them call `.then()`
  // explicitly, they just `await` the builder like a Promise.
  then<TResult1, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  private execute(): { data: unknown; error: { message: string } | null } {
    if (this.op === 'insert') {
      const row: Row = { ...this.payload };
      this.table.push(row);
      return { data: this.singleMode ? row : [row], error: null };
    }

    if (this.op === 'update') {
      const matched = this.table.filter((row) => this.filters.every((f) => f(row)));
      for (const row of matched) Object.assign(row, this.payload);
      return { data: null, error: null };
    }

    // select
    let rows = this.table.filter((row) => this.filters.every((f) => f(row)));
    // Apply sorts in reverse-declared order so the FIRST .order() call ends
    // up as the primary sort key (Array.prototype.sort is stable in Node).
    for (const { column, ascending } of [...this.orderBy].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[column] as string | number;
        const bv = b[column] as string | number;
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return ascending ? cmp : -cmp;
      });
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);

    if (this.maybeSingleMode) return { data: rows[0] ?? null, error: null };
    if (this.singleMode) return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'Row not found.' } };
    return { data: rows, error: null };
  }
}

// The enumerated table surface (Phase 2: menu_pricing's happy path). Phase 3
// will add orders/order_items/promotions/promotion_rewards/coupon_redemptions
// for the revenue-intelligence analytics tools — same class, more tables.
export type FakeTables = {
  restaurant_menu_assignments?: Row[];
  menus?: Row[];
  menu_categories?: Row[];
  menu_items?: Row[];
  restaurant_planner_proposals?: Row[];
  menu_discount_change_log?: Row[];
  [table: string]: Row[] | undefined;
};

export class FakeSupabaseClient {
  private tables: Record<string, Row[]>;

  constructor(seed: FakeTables) {
    this.tables = {};
    for (const [name, rows] of Object.entries(seed)) {
      // Deep clone, not a shallow array copy: fixture modules are ES
      // module singletons, so a shallow `[...rows]` shares row OBJECT
      // references across every conversation that imports the same
      // fixture. applyDiscountProposal's `.update()` mutates rows in place
      // (Object.assign) — without cloning, one golden conversation's apply
      // (e.g. discounting "Halwa") would silently leak into every other
      // conversation importing the same menu fixture, depending on test
      // execution order. Each replayConversation() call must get its own
      // fully independent table state.
      this.tables[name] = rows ? (JSON.parse(JSON.stringify(rows)) as Row[]) : [];
    }
  }

  from(tableName: string) {
    if (!this.tables[tableName]) this.tables[tableName] = [];
    const table = this.tables[tableName];
    return {
      select: (columns?: string) => new FakeQueryBuilder(table, 'select').select(columns),
      insert: (payload: Row) => new FakeQueryBuilder(table, 'insert', payload),
      update: (payload: Row) => new FakeQueryBuilder(table, 'update', payload),
    };
  }

  // Eval-only inspection hook — never part of the SupabaseClient surface,
  // used by golden-conversation assertions to look at what actually got
  // written (e.g. confirming a real version increment happened).
  getTable(tableName: string): Row[] {
    return this.tables[tableName] ?? [];
  }
}
