import { ChannelType, OverwriteType } from 'discord.js';
import YAML from 'yaml';
import { EVERYONE } from './blueprint.js';
import { bitsToNames } from './permissions.js';
import { CHANNEL_TYPES } from './reconcile.js';

const TYPE_NAMES = Object.fromEntries(Object.entries(CHANNEL_TYPES).map(([name, type]) => [type, name]));
const DEFAULT_BITRATE = 64000;

/** Gera um blueprint YAML a partir de um servidor existente. */
export function exportGuild(guild) {
  const roleName = (id) => (id === guild.id ? EVERYONE : guild.roles.cache.get(id)?.name);
  const skipped = [];

  const overwrites = (channel) =>
    channel.permissionOverwrites.cache
      .filter((o) => o.type === OverwriteType.Role && roleName(o.id))
      .map((o) => compact({ role: roleName(o.id), allow: bitsToNames(o.allow.bitfield), deny: bitsToNames(o.deny.bitfield) }));

  const channel = (c) => {
    const type = TYPE_NAMES[c.type];
    if (!type) {
      skipped.push(c.name);
      return null;
    }
    return compact({
      name: c.name,
      type: type === 'text' ? undefined : type,
      topic: c.topic ?? undefined,
      nsfw: c.nsfw || undefined,
      slowmode: c.rateLimitPerUser || undefined,
      userLimit: c.userLimit || undefined,
      bitrate: c.bitrate && c.bitrate !== DEFAULT_BITRATE ? c.bitrate : undefined,
      permissions: c.parentId && c.permissionsLocked ? undefined : overwrites(c),
    });
  };

  const byPosition = (a, b) => isVoice(a) - isVoice(b) || a.rawPosition - b.rawPosition;
  const all = [...guild.channels.cache.values()].filter((c) => !c.isThread());
  const childrenOf = (parentId) => all.filter((c) => c.type !== ChannelType.GuildCategory && c.parentId === parentId).sort(byPosition).map(channel).filter(Boolean);

  const data = compact({
    version: 1,
    server: compact({
      name: guild.name,
      systemChannel: guild.systemChannel?.name,
      afkChannel: guild.afkChannel?.name,
    }),
    everyone: { permissions: bitsToNames(guild.roles.everyone.permissions.bitfield) },
    roles: [...guild.roles.cache.values()]
      .filter((r) => r.id !== guild.id && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map((r) =>
        compact({
          name: r.name,
          color: r.colors.primaryColor ? `#${r.colors.primaryColor.toString(16).padStart(6, '0')}` : undefined,
          hoist: r.hoist || undefined,
          mentionable: r.mentionable || undefined,
          permissions: bitsToNames(r.permissions.bitfield),
        }),
      ),
    categories: all
      .filter((c) => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map((c) => compact({ name: c.name, permissions: overwrites(c), channels: childrenOf(c.id) })),
    channels: childrenOf(null),
  });

  const header = [
    '# yaml-language-server: $schema=./schema/blueprint.schema.json',
    `# Exportado de "${guild.name}" em ${new Date().toISOString().slice(0, 10)} pelo discord-forge.`,
  ];
  if (skipped.length) header.push(`# Canais de tipo não suportado ignorados: ${skipped.join(', ')}`);
  return `${header.join('\n')}\n${YAML.stringify(data, { lineWidth: 0 })}`;
}

function isVoice(c) {
  return Number(c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice);
}

/** Remove chaves undefined e listas vazias para manter o YAML enxuto. */
function compact(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
  );
}
