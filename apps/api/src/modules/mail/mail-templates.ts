/**
 * Outgoing email bodies (product-roadmap A2) as **pure functions** — no transport, no config, so
 * they are trivially unit-testable and the wording lives in one place. Vietnamese, matching the
 * builder UI. Every message is plain-text-first with a minimal HTML twin (no images/CSS) so it
 * survives strict mail clients.
 */
export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

/** Escape user-supplied text before it lands in the HTML body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build an absolute link into the SPA, e.g. `authLink("http://localhost:5173", "/verify-email", t)`.
 * The token rides in the query string because the SPA reads it with `useSearchParams`.
 */
export function authLink(baseUrl: string, path: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

export function verifyEmailMail(link: string, displayName?: string | null): MailContent {
  const greeting = displayName?.trim() ? `Chào ${displayName.trim()},` : "Xin chào,";
  return {
    subject: "Xác minh địa chỉ email của bạn",
    text: `${greeting}

Hãy mở liên kết dưới đây để xác minh địa chỉ email cho tài khoản Form Platform của bạn:

${link}

Liên kết chỉ dùng được một lần. Nếu bạn không tạo tài khoản này, hãy bỏ qua email.`,
    html: `<p>${escapeHtml(greeting)}</p>
<p>Hãy mở liên kết dưới đây để xác minh địa chỉ email cho tài khoản Form Platform của bạn:</p>
<p><a href="${escapeHtml(link)}">Xác minh email</a></p>
<p>Liên kết chỉ dùng được một lần. Nếu bạn không tạo tài khoản này, hãy bỏ qua email.</p>`,
  };
}

export function resetPasswordMail(link: string): MailContent {
  return {
    subject: "Đặt lại mật khẩu Form Platform",
    text: `Xin chào,

Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản này. Mở liên kết dưới đây để đặt mật khẩu mới:

${link}

Liên kết chỉ dùng được một lần và sẽ hết hạn. Nếu bạn không yêu cầu, hãy bỏ qua email — mật khẩu hiện tại vẫn giữ nguyên.`,
    html: `<p>Xin chào,</p>
<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản này. Mở liên kết dưới đây để đặt mật khẩu mới:</p>
<p><a href="${escapeHtml(link)}">Đặt lại mật khẩu</a></p>
<p>Liên kết chỉ dùng được một lần và sẽ hết hạn. Nếu bạn không yêu cầu, hãy bỏ qua email — mật khẩu hiện tại vẫn giữ nguyên.</p>`,
  };
}

export function passwordChangedMail(): MailContent {
  return {
    subject: "Mật khẩu Form Platform của bạn đã thay đổi",
    text: `Xin chào,

Mật khẩu tài khoản của bạn vừa được thay đổi và mọi phiên đăng nhập khác đã bị đăng xuất.

Nếu không phải bạn thực hiện, hãy dùng chức năng "Quên mật khẩu" để lấy lại quyền kiểm soát ngay.`,
    html: `<p>Xin chào,</p>
<p>Mật khẩu tài khoản của bạn vừa được thay đổi và mọi phiên đăng nhập khác đã bị đăng xuất.</p>
<p>Nếu không phải bạn thực hiện, hãy dùng chức năng &quot;Quên mật khẩu&quot; để lấy lại quyền kiểm soát ngay.</p>`,
  };
}

/** Tell someone a work-order case is now theirs (product-roadmap Phase E). No link: the case lives
 *  behind auth and a deep link would only bounce off the login screen. */
export function caseAssignedEmail(input: {
  displayName: string;
  caseLabel: string | null;
  statusLabel: string | null;
  projectName: string;
}): MailContent {
  const subject = input.caseLabel?.trim()
    ? `Việc mới: ${input.caseLabel.trim()}`
    : "Bạn có việc mới";
  const caseName = input.caseLabel?.trim() ?? "(chưa có nhãn)";
  const status = input.statusLabel?.trim() ?? "(chưa rõ)";
  return {
    subject,
    text: `Chào ${input.displayName},

Bạn vừa được giao một việc trong Form Platform:

- Việc: ${caseName}
- Trạng thái: ${status}
- Dự án: ${input.projectName}

Mở mục "Vận hành" trong Form Platform để xử lý.`,
    html: `<p>Chào ${escapeHtml(input.displayName)},</p>
<p>Bạn vừa được giao một việc trong Form Platform:</p>
<ul>
<li>Việc: ${escapeHtml(caseName)}</li>
<li>Trạng thái: ${escapeHtml(status)}</li>
<li>Dự án: ${escapeHtml(input.projectName)}</li>
</ul>
<p>Mở mục &quot;Vận hành&quot; trong Form Platform để xử lý.</p>`,
  };
}
