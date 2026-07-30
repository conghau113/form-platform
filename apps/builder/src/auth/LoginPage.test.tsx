import { screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../query/testing";
import { LoginPage } from "./LoginPage";
import { AuthProvider } from "./useAuth";

const providers = vi.hoisted(() => ({ google: false }));

vi.mock("./client", () => ({
  fetchMe: async () => null,
  fetchMyFunctions: async () => [],
  fetchAuthProviders: async () => providers,
  googleSignInUrl: "/api/auth/oauth/google",
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

function setup(initialPath = "/login") {
  return renderWithQuery(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("LoginPage — Google sign-in (A3)", () => {
  beforeEach(() => {
    providers.google = false;
  });

  it("hides the Google button when the deployment has not configured it", async () => {
    setup();

    // Wait for the email/password form so the providers query has had its chance to land.
    expect(await screen.findByPlaceholderText("you@example.com")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
  });

  it("offers the Google button once the API reports it configured", async () => {
    providers.google = true;
    setup();

    const button = await screen.findByRole("button", { name: /Google/ });
    expect(button).toBeTruthy();
  });

  it("surfaces a failed callback (?error=oauth) as a message", async () => {
    setup("/login?error=oauth");

    await waitFor(() => {
      expect(screen.getByText(/Đăng nhập bằng Google thất bại/)).toBeTruthy();
    });
  });
});
