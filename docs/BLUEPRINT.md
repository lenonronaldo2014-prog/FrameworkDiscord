# Formato do blueprint (`server.yaml`)

O blueprint descreve **o estado desejado** do servidor. A CLI compara com o servidor real e faz só o
necessário: cria o que falta, atualiza o que mudou e (com `--prune`) remove o que sobrou.
Tudo é identificado **pelo nome**: renomear algo no blueprint cria um item novo.

Adicione esta linha no topo para ter autocomplete e validação no VS Code (extensão YAML da Red Hat):

```yaml
# yaml-language-server: $schema=./schema/blueprint.schema.json
```

## Estrutura

```yaml
version: 1

server:                     # obrigatório
  name: Meu Servidor        # obrigatório, 2–100 caracteres
  verificationLevel: low    # none | low | medium | high | very_high
  defaultNotifications: mentions   # all | mentions
  systemChannel: boas-vindas       # canal de texto do blueprint que recebe avisos de entrada
  afkChannel: AFK                  # canal de voz do blueprint
  afkTimeout: 900                  # 60 | 300 | 900 | 1800 | 3600 (segundos)

everyone:                   # opcional: permissões base de @everyone
  permissions: [ViewChannel, SendMessages, ReadMessageHistory, Connect, Speak]

roles:                      # do mais alto para o mais baixo
  - name: Admin
    color: "#e74c3c"        # hex com aspas
    hoist: true             # aparece separado na lista de membros
    mentionable: false      # pode ser @mencionado por todos
    permissions: [Administrator]

categories:
  - name: 📌 Início
    private: false          # atalho: esconde de @everyone
    readonly: true          # atalho: @everyone não envia mensagens / não fala
    permissions:            # overwrites por cargo
      - role: Moderador
        allow: [SendMessages]
        deny: []
    channels:
      - name: regras
        type: text          # text | voice | announcement | stage | forum (padrão: text)
        topic: Leia antes de participar.
        slowmode: 0         # segundos (0–21600)
        nsfw: false
        messages:           # o bot publica uma vez; não duplica em execuções seguintes
          - content: Texto simples (até 2000 caracteres)
          - embed:
              title: Título
              description: |
                Texto com várias linhas.
              color: "#3498db"
              footer: Rodapé
              fields:
                - { name: Campo, value: Valor, inline: true }
            pin: true

      - name: Sala 1
        type: voice
        userLimit: 5        # 0 = ilimitado (voz/palco)
        bitrate: 64000      # 8000–96000 (até 384000 com boost)

channels:                   # canais fora de categoria (opcional)
  - name: geral
```

## Como as permissões funcionam

1. **`everyone.permissions`** e **`roles[].permissions`** são permissões do servidor inteiro.
   Se `everyone` for omitido, as permissões de @everyone não são alteradas.
2. **Overwrites** (`private`, `readonly`, `permissions`) ajustam o acesso em categorias e canais:
   - Na **categoria**, valem para ela e para todos os canais que não declaram overwrites próprios
     (esses canais ficam *sincronizados* com a categoria).
   - Num **canal**, os overwrites da categoria são herdados e os do canal são aplicados por cima.
     Ex.: categoria `private: true` + canal `readonly: true` = canal escondido **e** somente leitura.
3. Uma permissão não pode estar em `allow` e `deny` do mesmo cargo no mesmo nível. Entre níveis,
   o mais específico vence: o `allow` de um canal desfaz o `deny` herdado da categoria e vice-versa.
4. `role` aceita o nome de qualquer cargo do blueprint ou `"@everyone"`.

Padrões comuns:

```yaml
# Só a staff vê
- name: 🛡️ Staff
  private: true
  permissions:
    - role: Moderador
      allow: [ViewChannel]

# Todos leem, só um cargo escreve
- name: anuncios
  readonly: true
  permissions:
    - role: Admin
      allow: [SendMessages]

# Canal de voz silencioso (foco)
- name: Foco
  type: voice
  permissions:
    - role: "@everyone"
      deny: [Speak]

# Membro só vê o servidor após receber um cargo (verificação manual)
everyone:
  permissions: []
roles:
  - name: Verificado
    permissions: [ViewChannel, SendMessages, ReadMessageHistory, Connect, Speak]
```

## Regras e limites

- Nomes de cargos e categorias são únicos. Canais são únicos por (categoria, tipo, nome).
- Canais de texto/anúncio/fórum: o Discord força minúsculas e troca espaços por `-`. A CLI faz o
  mesmo e avisa. Canais de voz mantêm o nome como está.
- `announcement` e `stage` exigem o **modo Comunidade** ativo.
- `messages` só em canais `text` e `announcement`. Uma mensagem é considerada "já publicada" se
  houver, nas últimas 100 mensagens do bot no canal, uma com o mesmo texto e título/descrição de embed.
  Se você editar o texto, uma nova mensagem será publicada (a antiga continua lá).
- Limites do Discord: 250 cargos, 500 canais+categorias, 50 canais por categoria.
- Cargos acima do cargo do bot não podem ser editados: arraste o cargo do bot para o topo em
  Configurações do servidor › Cargos.
- Overwrites para **membros específicos** não são gerenciados nem apagados pelo blueprint.
