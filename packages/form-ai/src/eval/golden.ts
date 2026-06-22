import type { GoldenCase } from "./score.js";

/**
 * P1 slice 3 — the golden set.
 *
 * Each case pairs a natural-language `input` with a machine-checkable
 * `expect` (the bar a generated form must clear) and a `referenceDraft` — an
 * example correct answer. The LIVE model is scored only against `expect`; the
 * `referenceDraft` exists so the harness can run deterministically in CI (a
 * fixture provider replays it, no tokens) and so a self-test can prove every
 * expectation is actually achievable. Prompts mix English and Vietnamese
 * because the platform targets VN users.
 */
export const GOLDEN_FORMS: GoldenCase[] = [
  {
    id: "contact-en",
    input: { prompt: "A simple contact form with full name, email and a message." },
    expect: { minFields: 3, expectTypes: ["text", "textarea"], expectFields: ["email", "message"] },
    referenceDraft: {
      id: "contact",
      title: "Contact us",
      fields: [
        { type: "text", name: "full_name", label: "Full name" },
        { type: "text", name: "email", label: "Email" },
        { type: "textarea", name: "message", label: "Message" },
      ],
    },
  },
  {
    id: "contact-vi",
    input: { prompt: "Biểu mẫu liên hệ gồm họ tên, email và lời nhắn." },
    expect: { minFields: 3, expectTypes: ["text", "textarea"] },
    referenceDraft: {
      id: "lien-he",
      title: "Liên hệ",
      fields: [
        { type: "text", name: "ho_ten", label: "Họ tên" },
        { type: "text", name: "email", label: "Email" },
        { type: "textarea", name: "loi_nhan", label: "Lời nhắn" },
      ],
    },
  },
  {
    id: "event-registration",
    input: {
      prompt:
        "An event registration form: attendee name, email, a ticket type to pick from (standard/VIP), number of guests and the event date.",
    },
    expect: { minFields: 5, expectTypes: ["select", "number", "date"], expectFields: ["ticket"] },
    referenceDraft: {
      id: "event-registration",
      title: "Event registration",
      fields: [
        { type: "text", name: "attendee_name", label: "Attendee name" },
        { type: "text", name: "email", label: "Email" },
        {
          type: "select",
          name: "ticket_type",
          label: "Ticket type",
          options: [
            { label: "Standard", value: "standard" },
            { label: "VIP", value: "vip" },
          ],
        },
        { type: "number", name: "guests", label: "Number of guests" },
        { type: "date", name: "event_date", label: "Event date" },
      ],
    },
  },
  {
    id: "job-application",
    input: {
      prompt:
        "A job application form with name, email, a résumé file upload and a cover letter text area.",
    },
    expect: {
      minFields: 4,
      expectTypes: ["upload", "textarea"],
      expectFields: ["resume", "cover"],
    },
    referenceDraft: {
      id: "job-application",
      title: "Job application",
      fields: [
        { type: "text", name: "name", label: "Name" },
        { type: "text", name: "email", label: "Email" },
        { type: "upload", name: "resume", label: "Résumé" },
        { type: "textarea", name: "cover_letter", label: "Cover letter" },
      ],
    },
  },
  {
    id: "feedback-survey",
    input: {
      prompt:
        "A customer feedback survey: a star rating, how you heard about us (single choice), and any additional comments.",
    },
    expect: { minFields: 3, expectTypes: ["rate", "radio", "textarea"] },
    referenceDraft: {
      id: "feedback",
      title: "Feedback",
      fields: [
        { type: "rate", name: "rating", label: "Overall rating" },
        {
          type: "radio",
          name: "source",
          label: "How did you hear about us?",
          options: [
            { label: "Search", value: "search" },
            { label: "Friend", value: "friend" },
            { label: "Ad", value: "ad" },
          ],
        },
        { type: "textarea", name: "comments", label: "Additional comments" },
      ],
    },
  },
  {
    id: "newsletter-signup",
    input: {
      prompt:
        "A newsletter signup: email address and a set of topics the reader can subscribe to (news, product, events).",
    },
    expect: { minFields: 2, expectTypes: ["checkbox-group"], expectFields: ["email"] },
    referenceDraft: {
      id: "newsletter",
      title: "Newsletter signup",
      fields: [
        { type: "text", name: "email", label: "Email" },
        {
          type: "checkbox-group",
          name: "topics",
          label: "Topics",
          options: [
            { label: "News", value: "news" },
            { label: "Product", value: "product" },
            { label: "Events", value: "events" },
          ],
        },
      ],
    },
  },
  {
    id: "account-registration",
    input: {
      prompt: "An account sign-up form with email, a password and a confirm-password field.",
    },
    expect: { minFields: 3, expectTypes: ["password"], expectFields: ["password"] },
    referenceDraft: {
      id: "signup",
      title: "Create account",
      fields: [
        { type: "text", name: "email", label: "Email" },
        { type: "password", name: "password", label: "Password" },
        { type: "password", name: "password_confirm", label: "Confirm password" },
      ],
    },
  },
  {
    id: "address-form",
    input: {
      prompt: "An address form: street, city, postal code and a country to choose from a list.",
    },
    expect: { minFields: 4, expectTypes: ["text", "select"], expectFields: ["country"] },
    referenceDraft: {
      id: "address",
      title: "Address",
      fields: [
        { type: "text", name: "street", label: "Street" },
        { type: "text", name: "city", label: "City" },
        { type: "text", name: "postal_code", label: "Postal code" },
        {
          type: "select",
          name: "country",
          label: "Country",
          options: [
            { label: "Vietnam", value: "vn" },
            { label: "United States", value: "us" },
          ],
        },
      ],
    },
  },
  {
    id: "appointment-booking",
    input: {
      prompt:
        "An appointment booking form: pick a service, a preferred date and a preferred time, plus your phone number.",
    },
    expect: { minFields: 4, expectTypes: ["date", "time", "select"] },
    referenceDraft: {
      id: "appointment",
      title: "Book an appointment",
      fields: [
        {
          type: "select",
          name: "service",
          label: "Service",
          options: [
            { label: "Consultation", value: "consult" },
            { label: "Checkup", value: "checkup" },
          ],
        },
        { type: "date", name: "preferred_date", label: "Preferred date" },
        { type: "time", name: "preferred_time", label: "Preferred time" },
        { type: "text", name: "phone", label: "Phone number" },
      ],
    },
  },
  {
    id: "order-line-items",
    input: {
      prompt:
        "An order form with customer name and a repeatable list of line items, where each item has a product name and a quantity.",
    },
    expect: { minFields: 2, expectTypes: ["array", "number"], expectFields: ["item"] },
    referenceDraft: {
      id: "order",
      title: "Order",
      fields: [
        { type: "text", name: "customer_name", label: "Customer name" },
        {
          type: "array",
          name: "line_items",
          label: "Line items",
          itemFields: [
            { type: "text", name: "product", label: "Product" },
            { type: "number", name: "quantity", label: "Quantity" },
          ],
        },
      ],
    },
  },
];
