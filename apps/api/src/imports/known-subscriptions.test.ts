import { describe, expect, it } from "vitest";
import { matchKnownSubscription } from "./known-subscriptions.js";

describe("matchKnownSubscription", () => {
  it("matches known streaming/music/app-subscription descriptors, case-insensitive substring", () => {
    expect(matchKnownSubscription("NETFLIX.COM")).toBe("Netflix");
    expect(matchKnownSubscription("netflix.com los gatos ca")).toBe("Netflix");
    expect(matchKnownSubscription("SPOTIFY *PREMIUM")).toBe("Spotify");
    expect(matchKnownSubscription("IFOOD CLUBE MENSAL")).toBe("iFood Clube");
    expect(matchKnownSubscription("UBER ONE")).toBe("Uber One");
    expect(matchKnownSubscription("HBOMAX.COM")).toBe("HBO Max");
  });

  it("does not flag a generic iFood order or Uber ride as a subscription", () => {
    expect(matchKnownSubscription("IFOOD *IFOOD")).toBeNull();
    expect(matchKnownSubscription("UBER *TRIP")).toBeNull();
  });

  it("returns null for an unrecognized description", () => {
    expect(matchKnownSubscription("SUPERMERCADO EXTRA")).toBeNull();
  });
});
