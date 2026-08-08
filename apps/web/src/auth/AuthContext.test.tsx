// apps/web/src/auth/AuthContext.test.tsx
// Regression test for the "every page load logs me out" bug: StrictMode
// double-invokes AuthProvider's boot effect, firing two concurrent
// /v1/auth/refresh calls against the single-use refresh-token cookie. The
// loser of that race trips server-side reuse detection and revokes the
// whole token family — including the winner's brand-new token — killing
// the session on every reload.
import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";

vi.mock("./api-client", () => ({
  refreshAccessToken: vi.fn().mockResolvedValue(null),
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

import { refreshAccessToken } from "./api-client";

describe("AuthProvider boot", () => {
  it("attempts the silent refresh only once, even under StrictMode's double-invoked effects", async () => {
    render(
      <StrictMode>
        <AuthProvider>
          <div />
        </AuthProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    });
  });
});
