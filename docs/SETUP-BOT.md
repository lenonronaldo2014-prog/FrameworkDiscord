# Configurando o bot (uma vez só)

O Discord Forge usa um bot seu para aplicar o blueprint. Leva uns 3 minutos.

## 1. Criar a aplicação e o bot

1. Acesse <https://discord.com/developers/applications> e clique em **New Application**. Dê um nome (ex: *Forge*).
2. No menu lateral, abra **Bot**.
3. Clique em **Reset Token** e copie o token. **Ele é uma senha: não compartilhe, não cole em chats, não commite.**
4. Nenhum *Privileged Gateway Intent* é necessário.

## 2. Convidar o bot para o seu servidor

1. No menu lateral, abra **OAuth2 › URL Generator**.
2. Em *Scopes* marque `bot`.
3. Em *Bot Permissions* marque **Administrator** (mais simples) ou, no mínimo:
   Manage Server, Manage Roles, Manage Channels, View Channels, Send Messages,
   Read Message History, Manage Messages.
4. Abra a URL gerada, escolha o servidor e autorize.

Atalho: substitua `SEU_CLIENT_ID` (em **OAuth2 › Client ID**) neste link:

```
https://discord.com/oauth2/authorize?client_id=SEU_CLIENT_ID&scope=bot&permissions=8
```

> Dica: para testar, crie um servidor vazio novo (botão **+** no Discord › *Criar o meu*).

## 3. Pegar o ID do servidor

1. Discord › Configurações de usuário › **Avançado** › ative **Modo Desenvolvedor**.
2. Clique com o botão direito no ícone do servidor › **Copiar ID do servidor**.

## 4. Criar o `.env`

Na raiz do projeto, copie `.env.example` para `.env` e preencha:

```env
DISCORD_TOKEN=cole-o-token-aqui
DISCORD_GUILD_ID=123456789012345678
```

## 5. Testar

```bash
npm run check
```

Saída esperada:

```
✓ Conectado como Forge#1234 no servidor "Meu Servidor" (1 membros)
✓ Permissões do bot OK
```

### Problemas comuns

| Mensagem | Solução |
| --- | --- |
| `DISCORD_TOKEN inválido` | Gere um novo token em **Bot › Reset Token** e atualize o `.env`. |
| `O bot não está no servidor` | Convide o bot (passo 2) ou confira o `DISCORD_GUILD_ID`. |
| `Cargos acima do bot` | Em Configurações do servidor › Cargos, arraste o cargo do bot para o topo. |
| `Missing Permissions` ao criar canal `announcement`/`stage` | Ative o modo Comunidade: Configurações do servidor › **Ativar Comunidade**. |
