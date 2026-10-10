import { expect, test } from "bun:test";
import { pluralRu } from "./plural";

test("russian plural forms", () => {
  const f = ["устройство", "устройства", "устройств"] as const;
  expect([0, 1, 2, 5, 11, 21, 22, 25, 111].map((n) => pluralRu(n, f))).toEqual([
    "устройств",
    "устройство",
    "устройства",
    "устройств",
    "устройств",
    "устройство",
    "устройства",
    "устройств",
    "устройств",
  ]);
});
