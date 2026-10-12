const KIND = /^([A-Z]{2})(D?\d+)([A-Z]\d?)?$/;

export function parseId(id) {
  const match = KIND.exec(String(id).trim().toUpperCase());
  if (!match) return null;
  const [, country, digits, kind] = match;
  const design = digits.startsWith("D");
  const body = design ? digits.slice(1) : digits;
  return { country, design, number: body.replace(/^0+/, ""), kind: kind || "" };
}

export function formatNumber(id) {
  const parsed = parseId(id);
  if (!parsed) return String(id);
  const grouped = parsed.number.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${parsed.country} ${parsed.design ? "D" : ""}${grouped}`;
}

export function samePatent(id, pageNumber) {
  const parsed = parseId(id);
  const page = parseId(String(pageNumber).replace(/[^A-Za-z0-9]/g, ""));
  return Boolean(parsed && page && parsed.country === page.country && parsed.design === page.design && parsed.number === page.number);
}
