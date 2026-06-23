import type { GoldenWorkflowCase } from "./score.js";

/**
 * P3 / C5 — the workflow golden set.
 *
 * Each case pairs a natural-language `input` with a machine-checkable `expect`
 * (the bar a generated workflow must clear) and a `referenceDraft` — an example
 * correct answer. The LIVE model is scored only against `expect`; the
 * `referenceDraft` exists so the harness can run deterministically in CI (a
 * fixture provider replays it, no tokens) and so a self-test can prove every
 * reference is contract- AND graph-valid and every expectation is achievable.
 * Prompts mix English and Vietnamese because the platform targets VN users.
 *
 * Every reference is graph-valid: a single `start`, no dangling transitions, and
 * every state reachable from the start.
 */
export const GOLDEN_WORKFLOWS: GoldenWorkflowCase[] = [
  {
    // The moat acceptance test: "tạo quy trình duyệt nghỉ phép 3 cấp".
    id: "leave-approval-3-level-en",
    input: {
      prompt:
        "A 3-level leave-approval flow: an employee submits a leave request, the direct manager approves or rejects, then HR gives final approval.",
    },
    expect: {
      minStates: 5,
      minTransitions: 4,
      expectStates: ["manager", "hr", "approv"],
      expectActions: ["submit", "approve", "reject"],
    },
    referenceDraft: {
      id: "leave-approval-3-level",
      title: "Leave approval (3-level)",
      start: "draft",
      nodes: [
        { id: "draft", status: "Draft" },
        { id: "manager_review", status: "Manager review" },
        { id: "hr_review", status: "HR review" },
        { id: "approved", status: "Approved" },
        { id: "rejected", status: "Rejected" },
      ],
      transitions: [
        { id: "submit", from: "draft", to: "manager_review", action: "submit" },
        { id: "mgr_approve", from: "manager_review", to: "hr_review", action: "approve" },
        { id: "mgr_reject", from: "manager_review", to: "rejected", action: "reject" },
        { id: "hr_approve", from: "hr_review", to: "approved", action: "approve" },
        { id: "hr_reject", from: "hr_review", to: "rejected", action: "reject" },
      ],
    },
  },
  {
    id: "leave-approval-vi",
    input: {
      prompt:
        "Quy trình duyệt nghỉ phép: nhân viên gửi đơn, quản lý duyệt hoặc từ chối, sau đó nhân sự duyệt lần cuối.",
    },
    expect: {
      minStates: 4,
      minTransitions: 4,
      expectStates: ["quản lý", "nhân sự"],
      expectActions: ["duyet", "tu_choi"],
    },
    referenceDraft: {
      id: "duyet-nghi-phep",
      title: "Duyệt nghỉ phép",
      start: "ban_nhap",
      nodes: [
        { id: "ban_nhap", status: "Bản nháp" },
        { id: "quan_ly_duyet", status: "Quản lý duyệt" },
        { id: "nhan_su_duyet", status: "Nhân sự duyệt" },
        { id: "da_duyet", status: "Đã duyệt" },
        { id: "tu_choi", status: "Từ chối" },
      ],
      transitions: [
        { id: "gui", from: "ban_nhap", to: "quan_ly_duyet", action: "gui" },
        { id: "ql_duyet", from: "quan_ly_duyet", to: "nhan_su_duyet", action: "duyet" },
        { id: "ql_tu_choi", from: "quan_ly_duyet", to: "tu_choi", action: "tu_choi" },
        { id: "ns_duyet", from: "nhan_su_duyet", to: "da_duyet", action: "duyet" },
      ],
    },
  },
  {
    id: "purchase-approval-en",
    input: {
      prompt:
        "A purchase-request approval: an employee raises a request, a manager approves it, then finance pays it.",
    },
    expect: {
      minStates: 4,
      minTransitions: 3,
      expectStates: ["manager", "finance"],
      expectActions: ["approve", "pay"],
    },
    referenceDraft: {
      id: "purchase-approval",
      title: "Purchase approval",
      start: "requested",
      nodes: [
        { id: "requested", status: "Requested" },
        { id: "manager_approval", status: "Manager approval" },
        { id: "finance_payment", status: "Finance payment" },
        { id: "paid", status: "Paid" },
      ],
      transitions: [
        { id: "to_mgr", from: "requested", to: "manager_approval", action: "submit" },
        { id: "approve", from: "manager_approval", to: "finance_payment", action: "approve" },
        { id: "pay", from: "finance_payment", to: "paid", action: "pay" },
      ],
    },
  },
  {
    id: "expense-claim-en",
    input: {
      prompt:
        "An expense claim: draft, submitted for review, then either approved or rejected back to draft for a fix.",
    },
    expect: {
      minStates: 4,
      minTransitions: 4,
      expectStates: ["submit", "approv", "reject"],
      expectActions: ["submit", "approve", "reject"],
    },
    referenceDraft: {
      id: "expense-claim",
      title: "Expense claim",
      start: "draft",
      nodes: [
        { id: "draft", status: "Draft" },
        { id: "submitted", status: "Submitted" },
        { id: "approved", status: "Approved" },
        { id: "rejected", status: "Rejected" },
      ],
      transitions: [
        { id: "submit", from: "draft", to: "submitted", action: "submit" },
        { id: "approve", from: "submitted", to: "approved", action: "approve" },
        { id: "reject", from: "submitted", to: "rejected", action: "reject" },
        { id: "rework", from: "rejected", to: "draft", action: "revise" },
      ],
    },
  },
  {
    id: "publish-simple-en",
    input: { prompt: "A simple content workflow: a draft that gets published." },
    expect: { minStates: 2, minTransitions: 1, expectActions: ["publish"] },
    referenceDraft: {
      id: "publish-simple",
      title: "Publish",
      start: "draft",
      nodes: [
        { id: "draft", status: "Draft" },
        { id: "published", status: "Published" },
      ],
      transitions: [{ id: "publish", from: "draft", to: "published", action: "publish" }],
    },
  },
  {
    id: "document-review-en",
    input: {
      prompt:
        "A document review: draft → in review → either changes requested (back to draft) or approved → published.",
    },
    expect: {
      minStates: 5,
      minTransitions: 4,
      expectStates: ["review", "approv", "publish"],
      expectActions: ["approve", "request"],
    },
    referenceDraft: {
      id: "document-review",
      title: "Document review",
      start: "draft",
      nodes: [
        { id: "draft", status: "Draft" },
        { id: "in_review", status: "In review" },
        { id: "approved", status: "Approved" },
        { id: "changes_requested", status: "Changes requested" },
        { id: "published", status: "Published" },
      ],
      transitions: [
        { id: "to_review", from: "draft", to: "in_review", action: "submit" },
        { id: "approve", from: "in_review", to: "approved", action: "approve" },
        { id: "request", from: "in_review", to: "changes_requested", action: "request_changes" },
        { id: "rework", from: "changes_requested", to: "draft", action: "revise" },
        { id: "publish", from: "approved", to: "published", action: "publish" },
      ],
    },
  },
  {
    id: "bug-triage-en",
    input: {
      prompt: "A bug-tracking workflow: new, triaged, in progress, resolved, then closed.",
    },
    expect: {
      minStates: 5,
      minTransitions: 4,
      expectStates: ["triag", "progress", "resolv", "closed"],
    },
    referenceDraft: {
      id: "bug-triage",
      title: "Bug triage",
      start: "new",
      nodes: [
        { id: "new", status: "New" },
        { id: "triaged", status: "Triaged" },
        { id: "in_progress", status: "In progress" },
        { id: "resolved", status: "Resolved" },
        { id: "closed", status: "Closed" },
      ],
      transitions: [
        { id: "triage", from: "new", to: "triaged", action: "triage" },
        { id: "start", from: "triaged", to: "in_progress", action: "start" },
        { id: "resolve", from: "in_progress", to: "resolved", action: "resolve" },
        { id: "close", from: "resolved", to: "closed", action: "close" },
      ],
    },
  },
  {
    id: "onboarding-vi",
    input: {
      prompt:
        "Quy trình onboarding nhân viên mới: tạo hồ sơ, IT cấp thiết bị, quản lý xác nhận hoàn tất.",
    },
    expect: { minStates: 4, minTransitions: 3, expectActions: ["xac_nhan"] },
    referenceDraft: {
      id: "onboarding-nv",
      title: "Onboarding nhân viên",
      start: "tao_ho_so",
      nodes: [
        { id: "tao_ho_so", status: "Tạo hồ sơ" },
        { id: "cap_thiet_bi", status: "Cấp thiết bị" },
        { id: "xac_nhan", status: "Quản lý xác nhận" },
        { id: "hoan_tat", status: "Hoàn tất" },
      ],
      transitions: [
        { id: "den_it", from: "tao_ho_so", to: "cap_thiet_bi", action: "chuyen_it" },
        { id: "den_ql", from: "cap_thiet_bi", to: "xac_nhan", action: "cap_xong" },
        { id: "xong", from: "xac_nhan", to: "hoan_tat", action: "xac_nhan" },
      ],
    },
  },
  {
    id: "purchase-vi",
    input: {
      prompt: "Quy trình duyệt mua sắm: nhân viên đề xuất, quản lý duyệt, kế toán thanh toán.",
    },
    expect: {
      minStates: 4,
      minTransitions: 3,
      expectStates: ["quản lý", "kế toán"],
      expectActions: ["duyet", "thanh_toan"],
    },
    referenceDraft: {
      id: "duyet-mua-sam",
      title: "Duyệt mua sắm",
      start: "de_xuat",
      nodes: [
        { id: "de_xuat", status: "Đề xuất" },
        { id: "quan_ly_duyet", status: "Quản lý duyệt" },
        { id: "ke_toan_thanh_toan", status: "Kế toán thanh toán" },
        { id: "hoan_tat", status: "Hoàn tất" },
      ],
      transitions: [
        { id: "gui", from: "de_xuat", to: "quan_ly_duyet", action: "gui" },
        { id: "duyet", from: "quan_ly_duyet", to: "ke_toan_thanh_toan", action: "duyet" },
        { id: "tt", from: "ke_toan_thanh_toan", to: "hoan_tat", action: "thanh_toan" },
      ],
    },
  },
];
