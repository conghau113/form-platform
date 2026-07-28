import { describe, expect, it } from "vitest";
import {
  authLink,
  passwordChangedMail,
  resetPasswordMail,
  verifyEmailMail,
} from "./mail-templates.js";

describe("mail templates (A2)", () => {
  it("builds an absolute SPA link with the token in the query string", () => {
    expect(authLink("http://localhost:5173", "/verify-email", "abc123")).toBe(
      "http://localhost:5173/verify-email?token=abc123",
    );
    // A trailing slash on the configured origin must not double up.
    expect(authLink("https://forms.example.com/", "/reset-password", "t+o k")).toBe(
      "https://forms.example.com/reset-password?token=t%2Bo%20k",
    );
  });

  it("puts the link in both the text and html body", () => {
    const link = "http://localhost:5173/verify-email?token=abc";
    const mail = verifyEmailMail(link, "Nina");
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(link);
    expect(mail.text).toContain("Chào Nina");

    const reset = resetPasswordMail(link);
    expect(reset.text).toContain(link);
    expect(reset.subject).toBeTruthy();
    expect(passwordChangedMail().text).toBeTruthy();
  });

  it("escapes a display name so it cannot inject markup", () => {
    const mail = verifyEmailMail("http://x/verify?token=1", '<img src=x onerror="alert(1)">');
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
  });
});
