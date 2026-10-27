import { test, expect } from "../../../src/frontend/test-kit";
import { channelFor, hasEmail, isMobilePhone, matchesContact, needsEmailSearch } from "../../../src/frontend/admin/leadContact";

test("only a mobile number counts as WhatsApp", () => {
  for (const phone of ["(31) 99999-8888", "31999998888", "+55 31 99999-8888", "55 31 9 9999 8888", "(11) 9 8888-7777"]) expect(isMobilePhone(phone), phone).toBe(true);
  for (const phone of ["(31) 3333-4444", "+55 31 3333-4444", "3133334444", "0800 123 4567", "", null, undefined, "12345", "(31) 8888-7777"]) expect(isMobilePhone(phone), String(phone)).toBe(false);
});

test("an e-mail is any address in the list the map returns", () => {
  expect(hasEmail("oi@empresa.com")).toBe(true);
  expect(hasEmail("a@b.com, c@d.com")).toBe(true);
  for (const value of ["", null, undefined, "sem arroba", "@", "a@b"]) expect(hasEmail(value), String(value)).toBe(false);
});

test("each choice keeps the leads that have what the team wants", () => {
  const both = { phone: "(31) 99999-1111", emails: "a@b.com" }, phoneOnly = { phone: "(31) 99999-1111", emails: null };
  const mailOnly = { phone: null, emails: "a@b.com" }, landline = { phone: "(31) 3333-4444", emails: null };
  const keep = (choice: Parameters<typeof matchesContact>[1]) => [both, phoneOnly, mailOnly, landline].filter(lead => matchesContact(lead, choice));
  expect(keep("any")).toHaveLength(4);
  expect(keep("whatsapp")).toEqual([both, phoneOnly]);
  expect(keep("email")).toEqual([both, mailOnly]);
  expect(keep("both")).toEqual([both]);
});

test("asking for e-mail makes the search read the websites, and the choice becomes the sales channel", () => {
  expect(["any", "whatsapp", "email", "both"].map(choice => needsEmailSearch(choice as "any"))).toEqual([false, false, true, true]);
  expect(["any", "whatsapp", "email", "both"].map(choice => channelFor(choice as "any"))).toEqual([null, "whatsapp", "email", null]);
});
