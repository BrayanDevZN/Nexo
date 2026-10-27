import { test, expect } from "../../../src/frontend/test-kit";
import { channelFor, contactParts, hasEmail, instagramHandle, instagramUrl, isMobilePhone, matchesContact, needsEmailSearch, siteUrl, type ContactChoice } from "../../../src/frontend/admin/leadContact";

test("only a mobile number counts as WhatsApp", () => {
  for (const phone of ["(31) 99999-8888", "31999998888", "+55 31 99999-8888", "55 31 9 9999 8888", "(11) 9 8888-7777"]) expect(isMobilePhone(phone), phone).toBe(true);
  for (const phone of ["(31) 3333-4444", "+55 31 3333-4444", "3133334444", "0800 123 4567", "", null, undefined, "12345", "(31) 8888-7777"]) expect(isMobilePhone(phone), String(phone)).toBe(false);
});

test("an e-mail is any address in the list the map returns", () => {
  expect(hasEmail("oi@empresa.com")).toBe(true);
  expect(hasEmail("a@b.com, c@d.com")).toBe(true);
  for (const value of ["", null, undefined, "sem arroba", "@", "a@b"]) expect(hasEmail(value), String(value)).toBe(false);
});

test("the website the map gives is Instagram, the company's own site or neither", () => {
  for (const url of ["https://www.instagram.com/padaria", "instagram.com/padaria/", "https://m.instagram.com/p", "https://instagr.am/x"]) {
    expect(instagramUrl(url), url).toBe(url.trim());
    expect(siteUrl(url), url).toBeNull();
  }
  for (const url of ["https://padaria.com.br", "http://www.padaria.com/contato", "padaria.com"]) {
    expect(siteUrl(url), url).toBe(url);
    expect(instagramUrl(url), url).toBeNull();
  }
  for (const url of ["https://www.facebook.com/padaria", "https://wa.me/5531999998888", "https://linktr.ee/padaria", "https://notinstagram.com.br"]) {
    expect(instagramUrl(url), url).toBeNull();
  }
  expect(siteUrl("https://www.facebook.com/padaria")).toBeNull();
  expect(siteUrl("https://linktr.ee/padaria")).toBeNull();
  expect(siteUrl("https://notinstagram.com.br")).not.toBeNull();
  for (const empty of ["", null, undefined, "   "]) { expect(instagramUrl(empty)).toBeNull(); expect(siteUrl(empty)).toBeNull(); }
  expect(instagramHandle("https://www.instagram.com/padaria.santa/")).toBe("@padaria.santa");
  expect(instagramHandle("https://www.instagram.com/")).toBe("https://www.instagram.com/");
});

test("each choice keeps the leads that have what the team wants", () => {
  const both = { phone: "(31) 99999-1111", emails: "a@b.com", website: "https://a.com" }, phoneOnly = { phone: "(31) 99999-1111", emails: null, website: null };
  const mailOnly = { phone: null, emails: "a@b.com", website: null }, landline = { phone: "(31) 3333-4444", emails: null, website: null };
  const insta = { phone: null, emails: null, website: "https://instagram.com/loja" };
  const all = [both, phoneOnly, mailOnly, landline, insta];
  const keep = (choice: ContactChoice) => all.filter(lead => matchesContact(lead, choice));
  expect(keep("any")).toHaveLength(5);
  expect(keep("whatsapp")).toEqual([both, phoneOnly]);
  expect(keep("email")).toEqual([both, mailOnly]);
  expect(keep("both")).toEqual([both]);
  expect(keep("instagram")).toEqual([insta]);
  expect(keep("site")).toEqual([both]);
});

test("the screen, the CSV and the lead show only the contact that was chosen, and Todos shows everything", () => {
  expect(contactParts("any")).toEqual({ phone: true, email: true, instagram: true, site: true });
  expect(contactParts("whatsapp")).toEqual({ phone: true, email: false, instagram: false, site: false });
  expect(contactParts("email")).toEqual({ phone: false, email: true, instagram: false, site: false });
  expect(contactParts("instagram")).toEqual({ phone: false, email: false, instagram: true, site: false });
  expect(contactParts("site")).toEqual({ phone: false, email: false, instagram: false, site: true });
  expect(contactParts("both")).toEqual({ phone: true, email: true, instagram: false, site: false });
});

test("asking for e-mail makes the search read the websites, and a single contact becomes the sales channel", () => {
  const choices: ContactChoice[] = ["any", "whatsapp", "email", "instagram", "site", "both"];
  expect(choices.map(needsEmailSearch)).toEqual([false, false, true, false, false, true]);
  expect(choices.map(channelFor)).toEqual([null, "whatsapp", "email", "instagram", null, null]);
});
