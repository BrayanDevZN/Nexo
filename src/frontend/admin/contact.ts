export function whatsappUrl(phone: string, name: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const normalized = digits.startsWith("55") || digits.length > 11 ? digits : `55${digits}`;
  const text = encodeURIComponent(`Olá, ${name}! Aqui é da Nexo. Podemos conversar?`);
  return `https://wa.me/${normalized}?text=${text}`;
}
