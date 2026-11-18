# Formulario de interesse de escolas

Pagina: `/escolas`. Endpoint: `POST /api/escolas`.

## Perguntas e contato

Cinco perguntas de resposta unica (`role`, `schoolType`, `segments`, `evaluatesBooks`, `nextYearSelected`), seguidas de `name`, `schoolName`, `whatsapp` e `email`. Todos obrigatorios, validados tanto no navegador quanto no servidor. As opcoes e os textos usados nas notificacoes estao em `lib/school-leads.js`.

## E-mails

- Notificacao com todas as respostas para `editora@aquarelada.com.br`, hospedado no Umbler. Responder a essa mensagem usa o e-mail do interessado.
- Agradecimento para o interessado, informando que Leandro Dimov entrara em contato pelo WhatsApp (11) 98151-9590. A apresentacao nao e anexada nem enviada automaticamente.
- Usa o Resend existente e as variaveis `RESEND_API_KEY`, `LEAD_FROM_EMAIL` e `LEAD_REPLY_FROM` (opcional) do projeto Vercel. Nao altera as configuracoes dos demais formularios ou do Umbler.
- O sucesso do cadastro exige aceite da notificacao pelo provedor de e-mail. Falhas mantem os dados preenchidos para uma nova tentativa. A confirmacao so e anunciada na tela quando aceita pelo provedor.

## Armazenamento e repeticao de envios

Quando o Upstash existente esta disponivel, os registros usam `school:submission:<UUID>` e o indice ordenado `school:submissions`. Nao entram nas listas publicas da API antiga de leads. Nao ha endpoint publico de consulta dos cadastros de escolas.

O navegador mantem o identificador da tentativa enquanto os dados nao mudam. Os dois e-mails usam chaves de idempotencia diferentes; tentativas repetidas nao devem duplicar as mensagens. A confirmacao pendente pode ser reenviada com o mesmo identificador, sem repetir a notificacao interna.

Um campo invisivel ajuda a rejeitar robos e o Redis limita a oito tentativas por endereco de origem a cada dez minutos. Apenas o hash do endereco e usado no limite, com expiracao. Logs da funcao registram identificadores tecnicos, sem nome, telefone ou e-mail dos interessados.

A politica de privacidade abre em uma janela dentro da pagina, sem tirar o visitante do formulario. O aviso de selecao do exemplar fisico aparece junto ao cadastro e novamente antes do envio final.

## Verificacao

`node --test tests/school-leads.test.mjs` verifica obrigatoriedade, opcoes, destinos dos e-mails, conteudo da confirmacao, tratamento de falhas, repeticao de envios, limite de tentativas e escape de HTML. Testes automatizados nao enviam mensagens reais.

O servidor local atende a mesma funcao. Sem credenciais locais, retorna indisponibilidade de envio; nao simula sucesso nem confirma e-mails inexistentes. Use a previa da Vercel para o teste real com a configuracao ja conectada.
