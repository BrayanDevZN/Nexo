import { test, expect } from "../../../src/frontend/test-kit";
import { campaignOrigin, whatsappLink } from "../../../src/frontend/lib/whatsapp";

test("reads the campaign origin from the ad click or the UTM source", () => {
  expect(campaignOrigin("")).toBeNull();
  expect(campaignOrigin("?gclid=abc")).toBe("google-ads");
  expect(campaignOrigin("?gbraid=abc")).toBe("google-ads");
  expect(campaignOrigin("?wbraid=abc")).toBe("google-ads");
  expect(campaignOrigin("?utm_source=Instagram")).toBe("instagram");
  expect(campaignOrigin("?utm_source=google&gclid=abc")).toBe("google-ads");
});

test("ignores origins that are not simple tags", () => {
  for (const search of ["?utm_source=", "?utm_source=a b", "?utm_source=<script>", `?utm_source=${"x".repeat(31)}`, "?foo=bar"]) {
    expect(campaignOrigin(search)).toBeNull();
  }
});

test("builds the WhatsApp link with an encoded message and the origin when known", () => {
  const plain = whatsappLink("5531999999999", "Olá! Quero saber mais.", null);
  expect(plain).toBe("https://wa.me/5531999999999?text=Ol%C3%A1!%20Quero%20saber%20mais.");
  const tagged = new URL(whatsappLink("5531999999999", "Olá!", "google-ads"));
  expect(tagged.origin + tagged.pathname).toBe("https://wa.me/5531999999999");
  expect(tagged.searchParams.get("text")).toBe("Olá! (origem: google-ads)");
});
