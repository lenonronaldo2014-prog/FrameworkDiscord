# Permissões

Use os nomes exatamente como na coluna **Nome** (a CLI também aceita variações como
`send_messages` ou `sendmessages`). Nome errado gera erro de validação com sugestão.

## Gerais e de moderação

| Nome | O que permite |
| --- | --- |
| `Administrator` | Tudo, ignora overwrites. Dê a **um** cargo no máximo. |
| `ManageGuild` | Editar configurações do servidor |
| `ManageRoles` | Criar/editar cargos abaixo do seu |
| `ManageChannels` | Criar/editar/apagar canais |
| `ViewAuditLog` | Ver o registro de auditoria |
| `KickMembers` | Expulsar membros |
| `BanMembers` | Banir membros |
| `ModerateMembers` | Aplicar castigo (timeout) |
| `ManageNicknames` | Alterar apelido dos outros |
| `ChangeNickname` | Alterar o próprio apelido |
| `ManageWebhooks` | Gerenciar webhooks |
| `ManageGuildExpressions` | Gerenciar emojis, figurinhas e sons |
| `ManageEvents` / `CreateEvents` | Gerenciar / criar eventos |
| `CreateInstantInvite` | Criar convites |
| `ViewGuildInsights` | Ver estatísticas do servidor |

## Texto

| Nome | O que permite |
| --- | --- |
| `ViewChannel` | Ver o canal (sem isso o canal fica invisível) |
| `SendMessages` | Enviar mensagens |
| `SendMessagesInThreads` | Responder em threads e posts de fórum |
| `CreatePublicThreads` / `CreatePrivateThreads` | Criar threads |
| `ReadMessageHistory` | Ler mensagens antigas |
| `ManageMessages` | Apagar mensagens dos outros |
| `PinMessages` | Fixar mensagens |
| `ManageThreads` | Gerenciar threads e posts |
| `EmbedLinks` | Prévia de links |
| `AttachFiles` | Enviar arquivos e imagens |
| `AddReactions` | Adicionar reações |
| `UseExternalEmojis` / `UseExternalStickers` | Emojis/figurinhas de outros servidores |
| `MentionEveryone` | Mencionar @everyone, @here e todos os cargos |
| `SendTTSMessages` | Mensagens de texto para voz |
| `SendVoiceMessages` | Mensagens de voz |
| `SendPolls` | Criar enquetes |
| `UseApplicationCommands` | Usar comandos de barra (/) |
| `UseExternalApps` | Usar apps de usuário |
| `BypassSlowmode` | Ignorar o modo lento |

## Voz

| Nome | O que permite |
| --- | --- |
| `Connect` | Entrar no canal de voz |
| `Speak` | Falar |
| `Stream` | Transmitir tela / câmera |
| `UseVAD` | Detecção de voz (sem isso, só push-to-talk) |
| `PrioritySpeaker` | Voz prioritária |
| `MuteMembers` / `DeafenMembers` | Silenciar / ensurdecer outros |
| `MoveMembers` | Mover membros entre canais |
| `UseSoundboard` / `UseExternalSounds` | Soundboard |
| `UseEmbeddedActivities` | Atividades (jogos na call) |
| `RequestToSpeak` | Pedir para falar em palcos |
| `SetVoiceChannelStatus` | Definir status do canal de voz |

## Conjuntos prontos

```yaml
# Membro comum (para usar em everyone ou num cargo "Verificado")
[ViewChannel, SendMessages, ReadMessageHistory, AddReactions, EmbedLinks, AttachFiles,
 UseExternalEmojis, CreatePublicThreads, SendMessagesInThreads, Connect, Speak, Stream, UseVAD, ChangeNickname]

# Moderador
[ManageMessages, ManageThreads, KickMembers, BanMembers, ModerateMembers, MuteMembers, MoveMembers, ViewAuditLog]

# Admin sem Administrator
[ManageGuild, ManageChannels, ManageRoles, ManageWebhooks, ManageGuildExpressions, ManageEvents,
 ManageMessages, KickMembers, BanMembers, ModerateMembers, ViewAuditLog, MentionEveryone]
```
