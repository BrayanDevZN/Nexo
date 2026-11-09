export function whatsappUrl(phone: string, name: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const normalized = digits.startsWith("55") || digits.length > 11 ? digits : `55${digits}`;
  const text = encodeURIComponent(`Olá, ${name}! Aqui é da Nexo. Podemos conversar?`);
  return `https://wa.me/${normalized}?text=${text}`;
}

/** Google Maps link: by coordinates when known, otherwise by the name and address text. */
export function mapsUrl({ latitude, longitude, query }: { latitude?: number | null; longitude?: number | null; query?: string | null }) {
  const place = latitude != null && longitude != null ? `${latitude},${longitude}` : query?.trim();
  return place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : "";
}
