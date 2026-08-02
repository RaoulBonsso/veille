import { describe, it, expect, vi } from "vitest";
import { runSource, describeError } from "./runSource";

const meta = { key: "test", label: "Test", homepage: "https://e.dev", revalidate: 600 };

describe("describeError", () => {
  it("rend lisible une erreur réseau", () => {
    expect(describeError(new TypeError("fetch failed"))).toMatch(/injoignable|réseau/i);
  });

  it("rend lisible un timeout", () => {
    const e = new DOMException("aborted", "AbortError");
    expect(describeError(e)).toMatch(/délai|timeout/i);
  });

  it("garde le message d'une erreur applicative", () => {
    expect(describeError(new Error("HTTP 503"))).toContain("503");
  });

  it("gère une valeur jetée qui n'est pas une Error", () => {
    expect(describeError("boom")).toBeTypeOf("string");
    expect(describeError(null)).toBeTypeOf("string");
  });
});

describe("runSource", () => {
  it("renvoie les items en cas de succès", async () => {
    const r = await runSource(meta, async () => [1, 2, 3]);
    expect(r.failed).toBe(false);
    expect(r.items).toEqual([1, 2, 3]);
    expect(r.error).toBeNull();
    expect(r.key).toBe("test");
    expect(r.revalidate).toBe(600);
    expect(() => new Date(r.fetchedAt).toISOString()).not.toThrow();
  });

  it("NE JETTE PAS quand la source échoue — c'est la garantie anti-page-blanche", async () => {
    const r = await runSource(meta, async () => {
      throw new Error("HTTP 500");
    });
    expect(r.failed).toBe(true);
    expect(r.items).toEqual([]);
    expect(r.error).toContain("500");
  });

  it("attrape aussi une erreur synchrone", async () => {
    const r = await runSource(meta, () => {
      throw new Error("parse cassé");
    });
    expect(r.failed).toBe(true);
    expect(r.items).toEqual([]);
  });

  it("traite un retour non-tableau comme un échec plutôt que de propager du n'importe quoi", async () => {
    // @ts-expect-error test défensif volontaire
    const r = await runSource(meta, async () => ({ pas: "un tableau" }));
    expect(r.failed).toBe(true);
    expect(r.items).toEqual([]);
  });

  it("isole les sources entre elles : une qui tombe n'empêche pas les autres", async () => {
    const results = await Promise.all([
      runSource({ ...meta, key: "ok1" }, async () => ["a"]),
      runSource({ ...meta, key: "ko" }, async () => {
        throw new Error("down");
      }),
      runSource({ ...meta, key: "ok2" }, async () => ["b"]),
    ]);
    expect(results.map((r) => r.failed)).toEqual([false, true, false]);
    expect(results.flatMap((r) => r.items)).toEqual(["a", "b"]);
  });

  it("n'attend pas indéfiniment : le timeout global coupe la source", async () => {
    vi.useFakeTimers();
    // Promise<never[]> et non Promise<unknown> : sans le paramètre de type,
    // TypeScript ne peut pas prouver que le retour est bien un tableau.
    const p = runSource({ ...meta, timeoutMs: 50 }, () => new Promise<never[]>(() => {}));
    await vi.advanceTimersByTimeAsync(100);
    const r = await p;
    vi.useRealTimers();
    expect(r.failed).toBe(true);
    expect(r.error).toMatch(/délai|timeout/i);
  });
});
