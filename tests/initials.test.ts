import { describe, expect, it } from "vitest";
import { initials } from "@/lib/initials";

describe("initials (the letters on a category's tile)", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Eating Out")).toBe("EO");
    expect(initials("Transport & Fuel")).toBe("TF");
    expect(initials("rent / housing")).toBe("RH");
  });

  it("takes the first two letters of a single word, in capitals", () => {
    expect(initials("Groceries")).toBe("GR");
    expect(initials("x")).toBe("X");
  });

  it("copes with digits, accents, and nothing at all", () => {
    expect(initials("99 Speedmart")).toBe("9S");
    expect(initials("Éclair")).toBe("ÉC");
    expect(initials("")).toBe("•");
    expect(initials(null)).toBe("•");
    expect(initials(" & / ")).toBe("•");
  });
});
