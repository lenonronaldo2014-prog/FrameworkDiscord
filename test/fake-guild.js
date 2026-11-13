import { ChannelType, Collection, OverwriteType } from 'discord.js';

// Guild em memória com a mesma superfície da API do discord.js usada por reconcile/export.

let nextId = 1000;
const snowflake = () => String(nextId++);
const bits = (value) => ({ bitfield: BigInt(value ?? 0) });

function makeOverwrites(channel, guild) {
  return {
    cache: new Collection(),
    async set(list) {
      this.cache = new Collection(list.map((o) => [o.id, { id: o.id, type: o.type, allow: bits(o.allow), deny: bits(o.deny) }]));
      guild.log.push(`overwrites ${channel.name}`);
      return channel;
    },
  };
}

function serializeOverwrites(channel) {
  return [...channel.permissionOverwrites.cache.values()]
    .map((o) => `${o.id}:${o.type}:${o.allow.bitfield}:${o.deny.bitfield}`)
    .sort()
    .join('|');
}

export function createFakeGuild({ name = 'Teste' } = {}) {
  const guild = {
    id: snowflake(),
    name,
    verificationLevel: 0,
    defaultMessageNotifications: 0,
    afkTimeout: 300,
    systemChannelId: null,
    afkChannelId: null,
    features: [],
    log: [],
    client: { user: { id: 'bot' } },
    get systemChannel() {
      return this.channels.cache.get(this.systemChannelId) ?? null;
    },
    get afkChannel() {
      return this.channels.cache.get(this.afkChannelId) ?? null;
    },
    async edit(data) {
      if (data.name !== undefined) guild.name = data.name;
      if (data.verificationLevel !== undefined) guild.verificationLevel = data.verificationLevel;
      if (data.defaultMessageNotifications !== undefined) guild.defaultMessageNotifications = data.defaultMessageNotifications;
      if (data.afkTimeout !== undefined) guild.afkTimeout = data.afkTimeout;
      if (data.systemChannel !== undefined) guild.systemChannelId = data.systemChannel;
      if (data.afkChannel !== undefined) guild.afkChannelId = data.afkChannel;
      guild.log.push('edit guild');
    },
  };

  const makeRole = (data) => {
    const role = {
      id: data.id ?? snowflake(),
      name: data.name,
      colors: { primaryColor: data.colors?.primaryColor ?? 0 },
      hoist: data.hoist ?? false,
      mentionable: data.mentionable ?? false,
      permissions: bits(data.permissions),
      position: data.position ?? 1,
      managed: data.managed ?? false,
      async edit(changes) {
        if (changes.colors) role.colors.primaryColor = changes.colors.primaryColor;
        for (const key of ['hoist', 'mentionable', 'name']) if (changes[key] !== undefined) role[key] = changes[key];
        if (changes.permissions !== undefined) role.permissions = bits(changes.permissions);
        guild.log.push(`edit role ${role.name}`);
        return role;
      },
      async setPermissions(value) {
        role.permissions = bits(value);
        guild.log.push(`perms ${role.name}`);
      },
      async delete() {
        guild.roles.cache.delete(role.id);
        guild.log.push(`delete role ${role.name}`);
      },
    };
    return role;
  };

  const everyone = makeRole({ id: guild.id, name: '@everyone', position: 0, permissions: 0n });
  const botRole = makeRole({ name: 'Forge Bot', position: 1, managed: true, permissions: 8n });

  guild.roles = {
    cache: new Collection([[everyone.id, everyone], [botRole.id, botRole]]),
    everyone,
    async create(data) {
      // Como no Discord, cargos novos entram logo acima do @everyone.
      for (const r of this.cache.values()) if (r.position >= 1) r.position++;
      const role = makeRole({ ...data, position: 1 });
      this.cache.set(role.id, role);
      guild.log.push(`create role ${role.name}`);
      return role;
    },
    async setPositions(list) {
      for (const { role, position } of list) role.position = position;
      guild.log.push('role positions');
    },
  };

  guild.members = { me: { roles: { get highest() { return botRole; } }, permissions: { has: () => true }, user: { tag: 'Forge#0001' } } };

  const makeChannel = (data) => {
    const channel = {
      id: snowflake(),
      name: data.name,
      type: data.type,
      parentId: data.parent ?? null,
      rawPosition: guild.channels.cache.size,
      topic: data.topic ?? null,
      nsfw: data.nsfw ?? false,
      rateLimitPerUser: data.rateLimitPerUser ?? 0,
      userLimit: data.type === ChannelType.GuildVoice ? data.userLimit ?? 0 : undefined,
      bitrate: data.type === ChannelType.GuildVoice ? data.bitrate ?? 64000 : undefined,
      sent: [],
      isThread: () => false,
      get permissionsLocked() {
        const parent = guild.channels.cache.get(channel.parentId);
        return parent ? serializeOverwrites(parent) === serializeOverwrites(channel) : null;
      },
      async lockPermissions() {
        const parent = guild.channels.cache.get(channel.parentId);
        channel.permissionOverwrites.cache = new Collection(parent.permissionOverwrites.cache);
        guild.log.push(`lock ${channel.name}`);
      },
      async edit(changes) {
        for (const key of ['topic', 'nsfw', 'rateLimitPerUser', 'userLimit', 'bitrate']) {
          if (changes[key] !== undefined) channel[key] = changes[key];
        }
        if (changes.parent !== undefined) channel.parentId = changes.parent;
        guild.log.push(`edit channel ${channel.name}`);
      },
      messages: {
        fetch: async () => new Collection(channel.sent.map((m, i) => [String(i), m])),
      },
      async send(payload) {
        const message = { author: { id: 'bot' }, content: payload.content ?? '', embeds: payload.embeds ?? [], pin: async () => {} };
        channel.sent.push(message);
        guild.log.push(`send ${channel.name}`);
        return message;
      },
      async delete() {
        guild.channels.cache.delete(channel.id);
        guild.log.push(`delete channel ${channel.name}`);
      },
    };
    channel.permissionOverwrites = makeOverwrites(channel, guild);
    const parent = guild.channels?.cache.get(channel.parentId);
    const initial = data.permissionOverwrites ?? (parent ? [...parent.permissionOverwrites.cache.values()].map((o) => ({ ...o, allow: o.allow.bitfield, deny: o.deny.bitfield })) : []);
    channel.permissionOverwrites.cache = new Collection(
      initial.map((o) => [o.id, { id: o.id, type: o.type ?? OverwriteType.Role, allow: bits(o.allow), deny: bits(o.deny) }]),
    );
    return channel;
  };

  guild.channels = {
    cache: new Collection(),
    async create(data) {
      const channel = makeChannel(data);
      this.cache.set(channel.id, channel);
      guild.log.push(`create channel ${channel.name}`);
      return channel;
    },
    async setPositions(list) {
      for (const { channel, position } of list) channel.rawPosition = position;
      guild.log.push('channel positions');
    },
  };

  return guild;
}
