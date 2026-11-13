import { PermissionFlagsBits } from 'discord.js';

const byLowerName = new Map(
  Object.keys(PermissionFlagsBits).map((name) => [name.toLowerCase(), name]),
);

export const ALL_PERMISSIONS = Object.keys(PermissionFlagsBits);

/** Retorna o nome canônico (ex: "sendmessages" -> "SendMessages") ou null. */
export function canonicalPermission(name) {
  return byLowerName.get(String(name).replace(/[\s_-]/g, '').toLowerCase()) ?? null;
}

export function suggestPermission(name) {
  const needle = String(name).replace(/[\s_-]/g, '').toLowerCase();
  return ALL_PERMISSIONS.filter((p) => {
    const hay = p.toLowerCase();
    return hay.includes(needle) || needle.includes(hay);
  }).slice(0, 3);
}

/** Converte uma lista de nomes em bitfield. Assume que os nomes já foram validados. */
export function toBits(names = []) {
  let bits = 0n;
  for (const name of names) bits |= PermissionFlagsBits[canonicalPermission(name)];
  return bits;
}

export function bitsToNames(bits) {
  return ALL_PERMISSIONS.filter((name) => (BigInt(bits) & PermissionFlagsBits[name]) !== 0n);
}

// Permissões negadas a @everyone pelos atalhos `private` e `readonly`.
export const PRIVATE_DENY = PermissionFlagsBits.ViewChannel;
export const READONLY_DENY =
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.SendMessagesInThreads |
  PermissionFlagsBits.CreatePublicThreads |
  PermissionFlagsBits.CreatePrivateThreads |
  PermissionFlagsBits.Speak;
